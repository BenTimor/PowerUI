export type MessageRole = "user" | "assistant" | "system";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ModelEntry {
  id: number;
  providerId: string;
  modelId: string;
  label: string | null;
  starred: boolean;
  isDefault: boolean;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  providerId: string | null;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

/** A folder added to a chat as a working directory for agents. */
export interface ChatFolder {
  id: string;
  chatId: string;
  path: string;
  label: string | null;
  createdAt: number;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskCreatedBy = "user" | "manager";

export interface Task {
  id: string;
  chatId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  createdBy: TaskCreatedBy;
  createdAt: number;
  updatedAt: number;
}

/** A sub-agent definition, scoped per chat. */
export interface SubAgent {
  id: string;
  chatId: string;
  name: string;
  description: string;
  providerId: string | null;
  modelId: string | null;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

/** A running or finished instance of a sub-agent working on a task. */
export interface AgentRun {
  id: string;
  chatId: string;
  subAgentId: string;
  taskId: string;
  status: RunStatus;
  result: string;
  error: string;
  startedAt: number;
  endedAt: number | null;
  /** JSON-serialized working message list (system + history + tool msgs).
   *  Used to RESUME a stopped/finished run. Kept in sync each turn. */
  messagesJson: string;
  /** Loop turn count at last save, so resume doesn't re-burn the turn budget. */
  turn: number;
}

export type EventDirection =
  | "sub_to_manager"
  | "manager_to_sub"
  | "sub_to_user";
export type EventKind =
  | "message"
  | "question"
  | "answer"
  | "task_complete"
  | "started";

export interface AgentEvent {
  id: string;
  chatId: string;
  runId: string | null;
  direction: EventDirection;
  kind: EventKind;
  content: string;
  pending: boolean;
  createdAt: number;
  answeredAt: number | null;
}

/** A single step in a sub-agent run's ReAct loop, persisted so the full
 *  trace can be rendered in the sidebar trace view and replayed on resume. */
export type RunStepKind =
  | "thought"
  | "tool_call"
  | "tool_result"
  | "assistant_text"
  | "finished"
  | "error"
  | "paused" // run was stopped mid-flight
  | "resumed" // run was woken and is continuing
  | "steered"; // a steering message was injected into the run

export interface RunStep {
  id: string;
  runId: string;
  kind: RunStepKind;
  text: string;
  toolName: string | null;
  toolArgs: string | null;
  toolResult: string | null;
  turn: number;
  createdAt: number;
}

/** A model paired with its provider for display/selection. */
export interface ProviderModel {
  providerId: string;
  providerName: string;
  modelId: string;
  label: string;
}
