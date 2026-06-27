import { create } from "zustand";

import type { AgentEvent, AgentRun } from "@/types";
import * as db from "@/lib/db";
import { runAgentLoop } from "@/lib/agent/runAgentLoop";
import type { AgentLoopEvent } from "@/lib/agent/types";
import { buildSubAgentTools } from "@/lib/agent/subAgentTools";
import { agentBus } from "@/lib/agent/bus";
import { useChatsStore } from "./chatsStore";
import { useSubAgentsStore } from "./subAgentsStore";
import { useTasksStore } from "./tasksStore";
import { useChatFoldersStore } from "./chatFoldersStore";

const MAX_EVENT_CONTENT = 4000;

/** Active abort controllers keyed by runId, so cancelRun can abort a run. */
const activeControllers = new Map<string, AbortController>();

interface AgentActivityState {
  runs: AgentRun[];
  events: AgentEvent[];
  loading: boolean;
  load(chatId: string): Promise<void>;
  clear(): void;
  /** Launch a sub-agent on a task in the background. Returns runId or null on
   *  misconfiguration. Does NOT await completion. */
  launchSubAgent(
    chatId: string,
    subAgentId: string,
    taskId: string
  ): Promise<string | null>;
  cancelRun(runId: string): void;
  /** A user/manager answers a pending sub-agent question; persists + delivers. */
  answerQuestion(eventId: string, answer: string): Promise<void>;
}

async function persistAndEmit(input: {
  chatId: string;
  runId: string | null;
  direction: Parameters<typeof db.createAgentEvent>[0]["direction"];
  kind: Parameters<typeof db.createAgentEvent>[0]["kind"];
  content: string;
  pending?: boolean;
}): Promise<AgentEvent> {
  const ev = await db.createAgentEvent({
    chatId: input.chatId,
    runId: input.runId,
    direction: input.direction,
    kind: input.kind,
    content: input.content,
    pending: input.pending,
  });
  agentBus.emit(ev);
  return ev;
}

function truncateContent(s: string): string {
  return s.length <= MAX_EVENT_CONTENT ? s : s.slice(0, MAX_EVENT_CONTENT);
}

export const useAgentActivityStore = create<AgentActivityState>((set) => ({
  runs: [],
  events: [],
  loading: false,

  load: async (chatId) => {
    set({ loading: true });
    try {
      const [runs, events] = await Promise.all([
        db.listAgentRuns(chatId),
        db.listAgentEvents(chatId),
      ]);
      set({ runs, events });
    } finally {
      set({ loading: false });
    }
  },

  clear: () => set({ runs: [], events: [], loading: false }),

  launchSubAgent: async (chatId, subAgentId, taskId) => {
    const resolved = useSubAgentsStore.getState().resolveModel(subAgentId);
    if (!resolved) {
      await persistAndEmit({
        chatId,
        runId: null,
        direction: "sub_to_user",
        kind: "message",
        content: "Cannot start sub-agent: no provider/model configured",
      });
      await refreshEvents(chatId);
      return null;
    }

    const subAgent = useSubAgentsStore
      .getState()
      .subAgents.find((a) => a.id === subAgentId);
    const task = useTasksStore
      .getState()
      .tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const run = await db.createAgentRun({ chatId, subAgentId, taskId });
    set((s) => ({ runs: [run, ...s.runs] }));

    await useTasksStore.getState().assignTask(taskId, subAgentId);
    await useTasksStore.getState().setStatus(taskId, "in_progress");

    await persistAndEmit({
      chatId,
      runId: run.id,
      direction: "sub_to_user",
      kind: "started",
      content: `Sub-agent '${subAgent?.name ?? subAgentId}' started on task '${task.title}'`,
    });
    await refreshEvents(chatId);

    const roots = useChatFoldersStore.getState().folders.map((f) => f.path);

    const briefing = [
      `Task: ${task.title}`,
      task.description ? `Description: ${task.description}` : "",
      roots.length > 0
        ? `Workspace roots:\n${roots.map((r) => `  - ${r}`).join("\n")}`
        : "Workspace roots: (none configured)",
      "When you have finished the task, call the `complete_task` tool with a summary.",
      "Use `ask_manager` to ask the chat manager a blocking question.",
      "Use `send_message_to_manager` to report progress to the manager/user.",
      "read_file returns up to 2000 lines at a time; for large files, page through with the offset argument as noted in the result.",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt =
      (subAgent?.systemPrompt ?? "") + "\n\n" + briefing;

    const tools = buildSubAgentTools({ chatId, runId: run.id, taskId, roots });

    const controller = new AbortController();
    activeControllers.set(run.id, controller);

    const onEvent = async (e: AgentLoopEvent) => {
      if (e.kind === "assistant_text" && e.text && e.text.trim() !== "") {
        await persistAndEmit({
          chatId,
          runId: run.id,
          direction: "sub_to_user",
          kind: "message",
          content: truncateContent(e.text),
        });
        await refreshEvents(chatId);
      }
    };

    // Detached: do NOT await — launch returns the runId immediately.
    void (async () => {
      try {
        const res = await runAgentLoop({
          systemPrompt,
          model: {
            baseUrl: resolved.providerBaseUrl,
            apiKey: resolved.providerApiKey,
            modelId: resolved.modelId,
          },
          tools,
          userMessage: briefing,
          signal: controller.signal,
          onEvent,
        });
        await db.updateAgentRun(run.id, {
          status: "completed",
          result: res.finalText,
          endedAt: Date.now(),
        });
        await useTasksStore.getState().setStatus(taskId, "done");
        await persistAndEmit({
          chatId,
          runId: run.id,
          direction: "sub_to_user",
          kind: "task_complete",
          content: truncateContent(res.finalText),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.updateAgentRun(run.id, {
          status: "failed",
          error: msg,
          endedAt: Date.now(),
        });
        await persistAndEmit({
          chatId,
          runId: run.id,
          direction: "sub_to_user",
          kind: "message",
          content: `Sub-agent failed: ${msg}`,
        });
      } finally {
        activeControllers.delete(run.id);
        try {
          const refreshed = await db.listAgentRuns(chatId);
          set({ runs: refreshed });
          await refreshEvents(chatId);
        } catch {
          // best-effort refresh
        }
      }
    })();

    return run.id;
  },

  cancelRun: (runId) => {
    const controller = activeControllers.get(runId);
    if (controller) {
      controller.abort();
      activeControllers.delete(runId);
    }
    void (async () => {
      await db.updateAgentRun(runId, {
        status: "cancelled",
        endedAt: Date.now(),
      });
      const chatId = useChatsStore.getState().currentChatId;
      if (chatId) {
        const runs = await db.listAgentRuns(chatId);
        set({ runs });
        await refreshEvents(chatId);
      }
    })();
  },

  answerQuestion: async (eventId, answer) => {
    await db.answerAgentEvent(eventId, answer);
    agentBus.deliverAnswer(eventId, answer);
    const chatId = useChatsStore.getState().currentChatId;
    if (chatId) {
      await refreshEvents(chatId);
    }
  },
}));

async function refreshEvents(chatId: string): Promise<void> {
  const events = await db.listAgentEvents(chatId);
  useAgentActivityStore.setState({ events });
}
// ---- Auto-load on current chat change ------------------------------------
let lastChatId: string | null = useChatsStore.getState().currentChatId;
useChatsStore.subscribe((state) => {
  const id = state.currentChatId;
  if (id === lastChatId) return;
  lastChatId = id;
  if (id) {
    void useAgentActivityStore.getState().load(id);
  } else {
    useAgentActivityStore.getState().clear();
  }
});

// Eagerly load if a chat is already selected at module import time.
{
  const id = useChatsStore.getState().currentChatId;
  if (id) void useAgentActivityStore.getState().load(id);
}
