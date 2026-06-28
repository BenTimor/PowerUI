import { create } from "zustand";

import type { AgentEvent, AgentRun, RunStep, RunStepKind } from "@/types";
import type { AgentLoopEvent } from "@/lib/agent/types";
import type { LoopMessage } from "@/lib/api/openai";
import * as db from "@/lib/db";
import { runAgentLoop } from "@/lib/agent/runAgentLoop";
import { buildSubAgentTools } from "@/lib/agent/subAgentTools";
import { agentBus } from "@/lib/agent/bus";
import { runRuntime } from "@/lib/agent/runRuntime";
import { useChatsStore } from "./chatsStore";
import { useSubAgentsStore } from "./subAgentsStore";
import { useTasksStore } from "./tasksStore";
import { useChatFoldersStore } from "./chatFoldersStore";

const MAX_EVENT_CONTENT = 4000;

interface AgentActivityState {
  /** Runs for the CURRENTLY selected chat (drives the trace view + activity
   *  panel). Loaded on chat switch. */
  runs: AgentRun[];
  events: AgentEvent[];
  /** Steps for the run currently being viewed in the trace view (selectedRunId).
   *  Loaded on run selection. Updated live via the bus. */
  steps: RunStep[];
  loading: boolean;

  /** All runs across all chats (recent first), for the sidebar tree.
   *  Refreshed on launch/cancel/wake/completion and polled periodically so a
   *  chat with an active sub-agent shows a live indicator even when not open. */
  overview: AgentRun[];

  /** The run currently being inspected in the trace view (selected via the
   *  sidebar). null when viewing the parent chat (or nothing). */
  selectedRunId: string | null;

  load(chatId: string): Promise<void>;
  clear(): void;
  loadOverview(): Promise<void>;
  loadSteps(runId: string): Promise<void>;
  selectRun(runId: string | null): void;

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

  /** Inject a steering user-message into a RUNNING run's mailbox. The loop
   *  drains it on its next turn. No-op (returns false) if the run is not
   *  currently running. Also persisted as a 'steered' run_step + an event. */
  steerRun(runId: string, message: string): Promise<boolean>;
  /** Resume a stopped/finished run thread: re-launch the loop on the SAME
   *  runId, replaying its saved messages + the resume instruction. Appends a
   *  'paused' (if stopping) → 'resumed' divider in the trace. */
  wakeRun(runId: string, instruction: string): Promise<boolean>;
}

// ---- helpers -----------------------------------------------------------

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

/** Persist a loop event as a run_step and append it to the live steps state
 *  if that run is currently being viewed. */
async function persistStep(
  runId: string,
  e: AgentLoopEvent,
  turn: number
): Promise<void> {
  const kindMap: Record<AgentLoopEvent["kind"], RunStepKind> = {
    thought: "thought",
    assistant_text: "assistant_text",
    tool_call: "tool_call",
    tool_result: "tool_result",
    finished: "finished",
    error: "error",
  };
  const kind = kindMap[e.kind];
  if (!kind) return;
  const step = await db.createRunStep({
    runId,
    kind,
    text: e.text ?? e.finalText ?? e.error ?? null,
    toolName: e.toolName ?? null,
    toolArgs: e.toolArgs ?? null,
    toolResult: e.toolResult ?? null,
    turn,
  });
  // Live-update the trace view if this run is currently selected.
  const sel = useAgentActivityStore.getState().selectedRunId;
  if (sel === runId) {
    useAgentActivityStore.setState((s) => ({ steps: [...s.steps, step] }));
  }
}

/** Persist a marker step (paused/resumed/steered) for trace legibility. */
async function persistMarker(
  runId: string,
  kind: "paused" | "resumed" | "steered",
  note: string
): Promise<void> {
  const step = await db.createRunStep({
    runId,
    kind,
    text: note,
  });
  const sel = useAgentActivityStore.getState().selectedRunId;
  if (sel === runId) {
    useAgentActivityStore.setState((s) => ({ steps: [...s.steps, step] }));
  }
}

async function refreshRuns(chatId: string): Promise<void> {
  const runs = await db.listAgentRuns(chatId);
  useAgentActivityStore.setState({ runs });
}

async function refreshEvents(chatId: string): Promise<void> {
  const events = await db.listAgentEvents(chatId);
  useAgentActivityStore.setState({ events });
}

async function refreshOverview(): Promise<void> {
  const overview = await db.listRecentAgentRuns();
  useAgentActivityStore.setState({ overview });
}

/** Common execution for both a fresh launch and a wake/resume. Runs the loop
 *  detached, persists the full trace + working messages, and settles the run
 *  row when done. */
function executeRun(opts: {
  runId: string;
  chatId: string;
  taskId: string;
  systemPrompt: string;
  tools: ReturnType<typeof buildSubAgentTools>;
  /** Pre-built message list to start from (resume case). null → fresh
   *  [system, userMessage]. */
  initialMessages: LoopMessage[] | null;
  userMessage: string; // briefing OR resume instruction
  startTurn: number;
  model: { baseUrl: string; apiKey: string | null; modelId: string };
  /** Instruction message to inject into the mailbox immediately (steering). */
  injectedMailbox?: LoopMessage[];
}): void {
  const {
    runId,
    chatId,
    taskId,
    systemPrompt,
    tools,
    initialMessages,
    userMessage,
    startTurn,
    model,
  } = opts;

  const controller = new AbortController();
  const mailbox: LoopMessage[] = opts.injectedMailbox ? [...opts.injectedMailbox] : [];
  const messages: LoopMessage[] = [];
  let turn = startTurn;

  runRuntime.set(runId, { controller, mailbox, messages, startTurn, turn });

  const onEvent = async (e: AgentLoopEvent) => {
    // Roughly track the turn index for trace display. The loop emits a
    // 'thought' (or assistant_text on a terminal turn) at the start of each
    // model response, so bump the counter there.
    if (e.kind === "thought" || e.kind === "assistant_text") {
      turn += 1;
      const rt = runRuntime.get(runId);
      if (rt) rt.turn = turn;
    }
    // Drive the thinking trace for the viewed run.
    await persistStep(runId, e, turn);

    // Persist assistant_text as a manager/user-facing event too (legacy
    // inter-agent messaging surface used by ActivityPanel).
    if (e.kind === "assistant_text" && e.text && e.text.trim() !== "") {
      await persistAndEmit({
        chatId,
        runId,
        direction: "sub_to_user",
        kind: "message",
        content: truncateContent(e.text),
      });
      await refreshEvents(chatId);
    }
  };

  // Detached: do NOT await — returns immediately.
  void (async () => {
    let result;
    try {
      result = await runAgentLoop({
        systemPrompt,
        model,
        tools,
        userMessage,
        initialMessages: initialMessages ?? undefined,
        startingTurn: startTurn,
        signal: controller.signal,
        mailbox: () => {
          const m = mailbox;
          if (m.length > 0) mailbox.length = 0;
          return m;
        },
        onEvent,
        onCheckpoint: (msgs, t) => {
          // Keep the in-memory snapshot fresh so an abort can persist it.
          const rt = runRuntime.get(runId);
          if (rt) {
            rt.messages = msgs;
            rt.turn = t;
          }
          // Persist to DB (best-effort, non-blocking) so a crash/refresh can
          // still resume.
          void db.updateAgentRun(runId, {
            messagesJson: JSON.stringify(msgs),
            turn: t,
          });
        },
      });
      // Persist the final working message list so the run can be woken again.
      await db.updateAgentRun(runId, {
        status: "completed",
        result: truncateContent(result.finalText),
        endedAt: Date.now(),
        messagesJson: JSON.stringify(result.messages),
        turn: runRuntime.get(runId)?.turn ?? startTurn,
      });
      await useTasksStore.getState().setStatus(taskId, "done");
      await persistAndEmit({
        chatId,
        runId,
        direction: "sub_to_user",
        kind: "task_complete",
        content: truncateContent(result.finalText),
      });
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const msg = err instanceof Error ? err.message : String(err);
      // On abort, save the messages we have so the run can be RESUMED.
      const snapshot = runRuntime.get(runId)?.messages ?? [];
      await db.updateAgentRun(runId, {
        status: aborted ? "cancelled" : "failed",
        error: aborted ? "" : msg,
        endedAt: Date.now(),
        messagesJson: JSON.stringify(snapshot),
      });
      if (aborted) {
        await persistMarker(runId, "paused", "");
      } else {
        await persistAndEmit({
          chatId,
          runId,
          direction: "sub_to_user",
          kind: "message",
          content: `Sub-agent failed: ${msg}`,
        });
      }
    } finally {
      runRuntime.delete(runId);
      try {
        await Promise.all([
          refreshRuns(chatId),
          refreshEvents(chatId),
          refreshOverview(),
        ]);
      } catch {
        // best-effort refresh
      }
    }
  })();
}

export const useAgentActivityStore = create<AgentActivityState>((set, get) => ({
  runs: [],
  events: [],
  steps: [],
  overview: [],
  selectedRunId: null,
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

  clear: () =>
    set({ runs: [], events: [], steps: [], loading: false, selectedRunId: null }),

  loadOverview: async () => {
    await refreshOverview();
  },

  loadSteps: async (runId) => {
    const steps = await db.listRunSteps(runId);
    set({ steps });
  },

  selectRun: (runId) => {
    set({ selectedRunId: runId, steps: [] });
    if (runId) void get().loadSteps(runId);
  },

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
    const task = useTasksStore.getState().tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const run = await db.createAgentRun({ chatId, subAgentId, taskId });
    set((s) => ({ runs: [run, ...s.runs], overview: [run, ...s.overview] }));

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
      "Use `web_search` and `web_fetch` for current information or external documentation when needed; cite URLs in your summaries when you rely on web sources.",
      "read_file returns up to 2000 lines at a time; for large files, page through with the offset argument as noted in the result.",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = (subAgent?.systemPrompt ?? "") + "\n\n" + briefing;
    const tools = buildSubAgentTools({ chatId, runId: run.id, taskId, roots });

    executeRun({
      runId: run.id,
      chatId,
      taskId,
      systemPrompt,
      tools,
      initialMessages: null,
      userMessage: briefing,
      startTurn: 0,
      model: {
        baseUrl: resolved.providerBaseUrl,
        apiKey: resolved.providerApiKey,
        modelId: resolved.modelId,
      },
    });

    return run.id;
  },

  cancelRun: (runId) => {
    const rt = runRuntime.get(runId);
    if (rt) {
      rt.controller.abort();
      // NOTE: the actual run row update + 'paused' marker happen in the
      // detached loop's catch/finally, so we don't race the in-flight loop.
    } else {
      // No active runtime — the run already settled. Mark cancelled in the DB
      // so the UI reflects the intent (e.g. a stale 'running' row).
      void (async () => {
        await db.updateAgentRun(runId, {
          status: "cancelled",
          endedAt: Date.now(),
        });
        const chatId = useChatsStore.getState().currentChatId;
        if (chatId) {
          await refreshRuns(chatId);
          await refreshEvents(chatId);
        }
        await refreshOverview();
      })();
    }
  },

  answerQuestion: async (eventId, answer) => {
    await db.answerAgentEvent(eventId, answer);
    agentBus.deliverAnswer(eventId, answer);
    const chatId = useChatsStore.getState().currentChatId;
    if (chatId) await refreshEvents(chatId);
  },

  steerRun: async (runId, message) => {
    const rt = runRuntime.get(runId);
    if (!rt || rt.controller.signal.aborted) return false;
    const msg: LoopMessage = { role: "user", content: message };
    rt.mailbox.push(msg);
    await persistMarker(runId, "steered", message);
    // Also surface to the manager as an event so the chat can see the steer.
    const run = get().runs.find((r) => r.id === runId) ?? get().overview.find((r) => r.id === runId);
    if (run) {
      await persistAndEmit({
        chatId: run.chatId,
        runId,
        direction: "manager_to_sub",
        kind: "message",
        content: `(steer) ${message}`,
      });
      await refreshEvents(run.chatId);
    }
    return true;
  },

  wakeRun: async (runId, instruction) => {
    // Already running? Refuse (wake is for stopped/finished runs).
    if (runRuntime.isActive(runId)) return false;

    const run = get().runs.find((r) => r.id === runId) ?? get().overview.find((r) => r.id === runId);
    if (!run) return false;

    const subAgent = useSubAgentsStore.getState().subAgents.find(
      (a) => a.id === run.subAgentId
    );
    const task = useTasksStore.getState().tasks.find((t) => t.id === run.taskId);
    const resolved = useSubAgentsStore.getState().resolveModel(run.subAgentId);
    if (!resolved) return false;

    const roots = useChatFoldersStore.getState().folders.map((f) => f.path);

    // Replay the saved working messages. If there are none (old run), fall
    // back to a fresh briefing so the wake still does something useful.
    let initialMessages: LoopMessage[] | null = null;
    try {
      const parsed = JSON.parse(run.messagesJson || "[]") as LoopMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        initialMessages = parsed;
      }
    } catch {
      initialMessages = null;
    }

    const resumeMsg: LoopMessage = {
      role: "user",
      content:
        `(resumed) ${instruction}\n\n` +
        `You were previously working on this task and were paused. Continue from where you left off. The workspace and tools are the same.`,
    };

    if (initialMessages) {
      initialMessages = [...initialMessages, resumeMsg];
      // Wake gets a fresh turn budget: pass startTurn: 0 so maxTurns applies
      // to NEW turns only (the replayed history is already in initialMessages).
    } else {
      // No history — build a fresh briefing that includes the task + resume note.
      const briefing = [
        `Task: ${task?.title ?? run.taskId}`,
        task?.description ? `Description: ${task.description}` : "",
        roots.length > 0
          ? `Workspace roots:\n${roots.map((r) => `  - ${r}`).join("\n")}`
          : "Workspace roots: (none configured)",
        `(resumed) ${instruction}`,
        "When finished, call `complete_task` with a summary.",
      ]
        .filter(Boolean)
        .join("\n");
      resumeMsg.content = briefing;
    }

    const briefingText = task
      ? `Task: ${task.title}${task.description ? `\nDescription: ${task.description}` : ""}`
      : "";
    const systemPrompt = (subAgent?.systemPrompt ?? "") +
      (briefingText ? "\n\n" + briefingText : "");

    const tools = buildSubAgentTools({
      chatId: run.chatId,
      runId,
      taskId: run.taskId,
      roots,
    });

    // Mark the run as running again + record a 'resumed' marker in the trace.
    await db.updateAgentRun(runId, {
      status: "running",
      error: "",
      endedAt: null,
    });
    await persistMarker(runId, "resumed", instruction);
    if (task) {
      await useTasksStore.getState().setStatus(run.taskId, "in_progress");
    }
    await refreshRuns(run.chatId);
    await refreshOverview();

    executeRun({
      runId,
      chatId: run.chatId,
      taskId: run.taskId,
      systemPrompt,
      tools,
      initialMessages,
      userMessage: resumeMsg.content,
      startTurn: 0, // fresh budget on wake
      model: {
        baseUrl: resolved.providerBaseUrl,
        apiKey: resolved.providerApiKey,
        modelId: resolved.modelId,
      },
      // No mailbox injection needed: when there's history, the resume
      // message is already appended to initialMessages; when there isn't, it
      // becomes the loop's initial user message via `userMessage`.
      injectedMailbox: [],
    });

    return true;
  },
}));

// ---- Auto-load on current chat change ----------------------------------
let lastChatId: string | null = useChatsStore.getState().currentChatId;
useChatsStore.subscribe((state) => {
  const id = state.currentChatId;
  if (id === lastChatId) return;
  lastChatId = id;
  // Selecting a new chat closes any open trace view.
  useAgentActivityStore.setState({ selectedRunId: null, steps: [] });
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

// ---- Live overview polling ---------------------------------------------
// A chat can have an active sub-agent even when it isn't the currently-open
// chat. Poll the DB every few seconds so the sidebar tree reflects running
// state across all chats. (Cheap: single indexed query.)
if (typeof window !== "undefined") {
  void refreshOverview();
  window.setInterval(() => {
    void refreshOverview();
  }, 4000);
}

// ---- Live overview + trace updates via the bus -------------------------
// The per-chat steering mailbox stuff is fine, but for live UI updates we
// listen to ALL emitted events so the sidebar overview refreshes when any
// sub-agent (in any chat) makes progress, and the trace view updates when a
// step is persisted for the currently-selected run.
let overviewDebounce: ReturnType<typeof setTimeout> | null = null;
agentBus.onAll((e) => {
  // Debounce overview refreshes — a chatty sub-agent could emit many events.
  if (overviewDebounce) clearTimeout(overviewDebounce);
  overviewDebounce = setTimeout(() => {
    overviewDebounce = null;
    void refreshOverview();
  }, 200);
  // Throttle per-chat runs refresh for the OPEN chat so the ActivityPanel
  // (which reads `runs`) stays current without slamming the DB.
  const open = useChatsStore.getState().currentChatId;
  if (open && e.chatId === open) {
    void refreshRuns(open);
  }
  // Steps for the selected run are pushed live in persistStep(), so no
  // extra work needed here.
});
