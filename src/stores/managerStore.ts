import { create } from "zustand";

import * as db from "@/lib/db";
import { runAgentLoop } from "@/lib/agent/runAgentLoop";
import type { AgentLoopEvent } from "@/lib/agent/types";
import type { LoopMessage } from "@/lib/api/openai";
import { buildManagerTools } from "@/lib/agent/managerTools";
import { agentBus } from "@/lib/agent/bus";
import { useThinkingStore } from "./thinkingStore";
import { useChatsStore } from "./chatsStore";
import { useProvidersStore } from "./providersStore";
import { useTasksStore } from "./tasksStore";
import { useSubAgentsStore } from "./subAgentsStore";
import { useChatFoldersStore } from "./chatFoldersStore";
import { useAgentActivityStore } from "./agentActivityStore";

type LoopMsg = LoopMessage;

interface ManagerState {
  running: boolean;
  /** Latest intermediate "thought" from the active turn (transient,
   *  not persisted as a chat message). Cleared when the turn ends. */
  thinking: string | null;
  send(text: string): Promise<void>;
  stop(): void;
}

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= 40) return clean;
  return clean.slice(0, 40).trimEnd() + "…";
}

let controller: AbortController | null = null;
let mailbox: LoopMsg[] = [];
let subscribedChatId: string | null = null;

function buildContextSnapshot(chatId: string): string {
  const roots = useChatFoldersStore
    .getState()
    .folders.map((f) => f.path);
  const tasks = useTasksStore
    .getState()
    .tasks.filter((t) => t.chatId === chatId);
  const subAgents = useSubAgentsStore
    .getState()
    .subAgents.filter((a) => a.chatId === chatId);
  const activeRuns = useAgentActivityStore
    .getState()
    .runs.filter((r) => r.chatId === chatId && r.status === "running");

  const lines: string[] = [];

  lines.push("Workspace folder roots:");
  if (roots.length === 0) lines.push("  (none)");
  else roots.forEach((r) => lines.push(`  - ${r}`));

  lines.push("");
  lines.push("Tasks:");
  if (tasks.length === 0) lines.push("  (none)");
  else
    tasks.forEach((t) => {
      const assignee = t.assigneeId
        ? subAgents.find((a) => a.id === t.assigneeId)?.name ?? "unknown"
        : "none";
      lines.push(`  - [${t.status}] ${t.title} (id=${t.id}, assignee=${assignee})`);
    });

  lines.push("");
  lines.push("Sub-agents:");
  if (subAgents.length === 0) lines.push("  (none)");
  else
    subAgents.forEach((a) => {
      let model: string;
      if (!a.providerId && !a.modelId) model = "inherits chat";
      else {
        const resolved = useSubAgentsStore.getState().resolveModel(a.id);
        model = resolved
          ? `${resolved.providerName}/${resolved.modelId}`
          : "inherits chat";
      }
      lines.push(`  - ${a.name} (id=${a.id}): ${a.description} [model: ${model}]`);
    });

  lines.push("");
  lines.push("Active sub-agent runs:");
  if (activeRuns.length === 0) lines.push("  (none)");
  else
    activeRuns.forEach((r) => {
      const sa = subAgents.find((a) => a.id === r.subAgentId);
      const task = tasks.find((t) => t.id === r.taskId);
      lines.push(
        `  - run ${r.id}: ${sa?.name ?? r.subAgentId} on '${task?.title ?? r.taskId}' (started ${new Date(r.startedAt).toISOString()})`
      );
    });

  return lines.join("\n");
}

function buildSystemPrompt(chatId: string): string {
  const role =
    "You are the manager of a team working in this chat. You help the user by understanding goals, creating tasks, assigning them to sub-agents (each runs in the background), answering sub-agents' questions, and reporting progress. Your plain-text replies are shown directly to the user — write naturally. Prefer delegating concrete work to sub-agents rather than doing it yourself. When a sub-agent asks a question, use `answer_question` with the given question_event_id. You can also create and update sub-agent definitions yourself (create_sub_agent / update_sub_agent) so you can assemble your own team. You have read-only access to the chat's workspace folders via read_file / list_files.\n\nImportant: only your FINAL reply (a turn with no tool calls) is shown to the user as a message; any text you emit alongside tool calls is treated as private reasoning and is not displayed. So do not narrate intended actions to the user — just call the tool, then give your final summary once the work is done.";
  const snapshot = buildContextSnapshot(chatId);
  const tools =
    "Available tools: create_task, list_tasks, assign_task (launches a sub-agent on a task), update_task, create_sub_agent, update_sub_agent, list_sub_agents, list_folders, read_file (paged: pass offset to page through large files), list_files (read-only, scoped to workspace folders), answer_question.";
  return `${role}\n\n${snapshot}\n\n${tools}`;
}

/** Resolve the active chat's provider/model. Returns null on misconfig. */
function resolveChatModel() {
  const { currentChatId, chats } = useChatsStore.getState();
  if (!currentChatId) return null;
  const chat = chats.find((c) => c.id === currentChatId);
  if (!chat || !chat.providerId || !chat.modelId) return null;
  const provider = useProvidersStore.getState().getProvider(chat.providerId);
  if (!provider) return null;
  return {
    chatId: currentChatId,
    chat,
    provider,
    modelId: chat.modelId,
  };
}

type Trigger = { type: "user" | "event"; text: string };

async function startTurn(trigger: Trigger): Promise<void> {
  const resolved = resolveChatModel();
  if (!resolved) {
    useChatsStore.setState({
      error: "Please select a provider and model for this chat first.",
    });
    return;
  }
  const { chatId, provider, modelId } = resolved;

  useManagerStore.setState({ running: true, thinking: null });

  // Assistant placeholder.
  const aMsg = await db.insertMessage({
    chatId,
    role: "assistant",
    content: "",
  });
  useChatsStore.setState((s) => ({
    messages: [...s.messages, aMsg],
  }));
  // Begin a fresh thinking trace bound to this assistant message.
  useThinkingStore.getState().begin(aMsg.id);

  const systemPrompt = buildSystemPrompt(chatId);

  // Build the conversation history, excluding the empty placeholder just
  // added (it carries no content).
  const history = useChatsStore
    .getState()
    .messages.filter(
      (m) => !(m.id === aMsg.id || (m.role === "assistant" && m.content === ""))
    )
    .map((m) => ({ role: m.role, content: m.content })) as LoopMsg[];

  const triggerMsg: LoopMsg[] =
    trigger.type === "event"
      ? [{ role: "user", content: trigger.text }]
      : [];

  const initialMessages: LoopMsg[] = [
    { role: "system", content: systemPrompt },
    ...history,
    ...triggerMsg,
  ];

  controller = new AbortController();
  mailbox = [];
  let assembled = "";

  const onEvent = (e: AgentLoopEvent) => {
    // Feed the thinking trace (collapsible block in the bubble).
    useThinkingStore.getState().append(aMsg.id, e);
    if (e.kind === "thought" && e.text) {
      useManagerStore.setState({
        thinking: e.text.length > 200 ? e.text.slice(0, 200) + "…" : e.text,
      });
    } else if (e.kind === "assistant_text" && e.text) {
      // Terminal answer — this is the user-facing reply.
      assembled += e.text;
      const snapshot = assembled;
      useManagerStore.setState({ thinking: null });
      useChatsStore.setState((s) => ({
        messages: s.messages.map((m) =>
          m.id === aMsg.id ? { ...m, content: snapshot } : m
        ),
      }));
    }
  };

  try {
    const res = await runAgentLoop({
      systemPrompt,
      model: { baseUrl: provider.baseUrl, apiKey: provider.apiKey, modelId },
      tools: buildManagerTools(chatId),
      userMessage: "",
      initialMessages,
      signal: controller.signal,
      mailbox: () => {
        const m = mailbox;
        mailbox = [];
        return m;
      },
      onEvent,
    });
    const final = assembled || res.finalText || "";
    // Even if the model never produced a real answer, surface something
    // instead of leaving an empty bubble (which renders as "—").
    const persisted = final || "_(the manager ended its turn without a final reply)_";
    await db.updateMessageContent(aMsg.id, persisted);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown manager error";
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    if (!aborted) {
      useChatsStore.setState({ error: message });
    }
    const persisted = assembled || (aborted ? "_(stopped)_" : "_(the manager ended its turn without a final reply)_");
    await db.updateMessageContent(aMsg.id, persisted);
  } finally {
    controller = null;
    useManagerStore.setState({ running: false, thinking: null });
    await db.touchChat(chatId);
    useChatsStore.setState((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, updatedAt: Date.now() } : c
      ),
    }));
  }
}

function handleBusEvent(e: Parameters<Parameters<typeof agentBus.on>[1]>[0]): void {
  if (e.direction !== "sub_to_manager") return;
  if (e.kind !== "message" && e.kind !== "question" && e.kind !== "task_complete")
    return;
  const currentChatId = useChatsStore.getState().currentChatId;
  if (e.chatId !== currentChatId) return;

  let triggerText: string;
  if (e.kind === "question") {
    triggerText = `Sub-agent question (id=${e.id}): ${e.content}`;
  } else if (e.kind === "task_complete") {
    triggerText = `Sub-agent completed its task. Summary: ${e.content}`;
  } else {
    triggerText = `Sub-agent update: ${e.content}`;
  }

  const trigger: Trigger = { type: "event", text: triggerText };
  if (useManagerStore.getState().running) {
    mailbox.push({ role: "user", content: triggerText } as LoopMsg);
  } else {
    void startTurn(trigger);
  }
}

/** Re-subscribe to agentBus whenever the current chat changes so the manager
 *  only reacts to events for the active chat. Executed once at import. */
function syncSubscription(): void {
  const id = useChatsStore.getState().currentChatId;
  if (id === subscribedChatId) return;
  // The bus subscription can't be "moved"; we re-subscribe per chat id.
  // (Unsubscribe is handled by tracking the latest cleanup.)
  subscribedChatId = id;
  // Subscribe for every chat the manager should react to. We track one
  // active unsubscribe here.
  if (latestUnsubscribe) {
    latestUnsubscribe();
    latestUnsubscribe = null;
  }
  if (id) {
    latestUnsubscribe = agentBus.on(id, handleBusEvent);
  }
}

let latestUnsubscribe: (() => void) | null = null;

// Initial subscription + tracking of currentChatId changes.
syncSubscription();
let prevChatId: string | null = useChatsStore.getState().currentChatId;
useChatsStore.subscribe((state) => {
  if (state.currentChatId === prevChatId) return;
  prevChatId = state.currentChatId;
  syncSubscription();
});

export const useManagerStore = create<ManagerState>(() => ({
  running: false,
  thinking: null,

  async send(text) {
    const { currentChatId, messages, chats } = useChatsStore.getState();
    if (!currentChatId) return;
    const content = text.trim();
    if (!content) return;

    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return;
    if (!chat.providerId || !chat.modelId) {
      useChatsStore.setState({
        error: "Please select a provider and model for this chat first.",
      });
      return;
    }
    const provider = useProvidersStore
      .getState()
      .getProvider(chat.providerId);
    if (!provider) {
      useChatsStore.setState({
        error: "The provider for this chat no longer exists.",
      });
      return;
    }

    useChatsStore.setState({ error: null });

    // Persist the user message.
    const userMsg = await db.insertMessage({
      chatId: currentChatId,
      role: "user",
      content,
    });

    // Auto-title on first user message.
    const isFirst = messages.length === 0;
    let title = chat.title;
    if (isFirst || chat.title === "New chat") {
      title = deriveTitle(content);
      await db.updateChat(currentChatId, { title });
    }
    await db.touchChat(currentChatId);

    useChatsStore.setState((s) => ({
      messages: [...s.messages, userMsg],
      chats: s.chats.map((c) =>
        c.id === currentChatId
          ? { ...c, title, updatedAt: Date.now() }
          : c
      ),
    }));

    // If a manager turn is already active, inject into the mailbox so the
    // running loop picks it up on its next turn instead of starting a new
    // turn (which would collide with the active assistant message).
    if (useManagerStore.getState().running) {
      mailbox.push({ role: "user", content } as LoopMsg);
      return;
    }

    await startTurn({ type: "user", text: content });
  },

  stop() {
    if (controller) controller.abort();
  },
}));
