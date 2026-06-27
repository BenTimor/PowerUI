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

/** A model paired with its provider for display/selection. */
export interface ProviderModel {
  providerId: string;
  providerName: string;
  modelId: string;
  label: string;
}
