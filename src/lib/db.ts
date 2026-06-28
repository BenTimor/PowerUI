import Database from "@tauri-apps/plugin-sql";

import type {
  AgentEvent,
  AgentRun,
  Chat,
  ChatFolder,
  EventDirection,
  EventKind,
  Message,
  MessageRole,
  ModelEntry,
  Provider,
  RunStatus,
  SubAgent,
  Task,
  TaskStatus,
} from "@/types";

let _db: Database | null = null;

const DB_URI = "sqlite:powerui.db";

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load(DB_URI);
  return _db;
}

/** Generate a reasonably-unique id without external deps. */
export function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

function rowToProvider(r: Record<string, unknown>): Provider {
  return {
    id: r.id as string,
    name: r.name as string,
    baseUrl: r.base_url as string,
    apiKey: (r.api_key as string) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToModel(r: Record<string, unknown>): ModelEntry {
  return {
    id: r.id as number,
    providerId: r.provider_id as string,
    modelId: r.model_id as string,
    label: (r.label as string) ?? null,
    starred: (r.starred as number) === 1,
    isDefault: (r.is_default as number) === 1,
    createdAt: r.created_at as number,
  };
}

function rowToChat(r: Record<string, unknown>): Chat {
  return {
    id: r.id as string,
    title: r.title as string,
    providerId: (r.provider_id as string) ?? null,
    modelId: (r.model_id as string) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    role: r.role as MessageRole,
    content: r.content as string,
    createdAt: r.created_at as number,
  };
}

function rowToFolder(r: Record<string, unknown>): ChatFolder {
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    path: r.path as string,
    label: (r.label as string) ?? null,
    createdAt: r.created_at as number,
  };
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    title: r.title as string,
    description: (r.description as string) ?? "",
    status: r.status as TaskStatus,
    assigneeId: (r.assignee_id as string) ?? null,
    createdBy: (r.created_by as "user" | "manager") ?? "user",
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToSubAgent(r: Record<string, unknown>): SubAgent {
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    providerId: (r.provider_id as string) ?? null,
    modelId: (r.model_id as string) ?? null,
    systemPrompt: (r.system_prompt as string) ?? "",
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToAgentRun(r: Record<string, unknown>): AgentRun {
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    subAgentId: r.sub_agent_id as string,
    taskId: r.task_id as string,
    status: r.status as RunStatus,
    result: (r.result as string) ?? "",
    error: (r.error as string) ?? "",
    startedAt: r.started_at as number,
    endedAt: (r.ended_at as number) ?? null,
  };
}

function rowToAgentEvent(r: Record<string, unknown>): AgentEvent {
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    runId: (r.run_id as string) ?? null,
    direction: r.direction as EventDirection,
    kind: r.kind as EventKind,
    content: (r.content as string) ?? "",
    pending: (r.pending as number) === 1,
    createdAt: r.created_at as number,
    answeredAt: (r.answered_at as number) ?? null,
  };
}

// ---- Providers ----

export async function listProviders(): Promise<Provider[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM providers ORDER BY created_at ASC"
  );
  return rows.map(rowToProvider);
}

export async function createProvider(input: {
  name: string;
  baseUrl: string;
  apiKey?: string | null;
}): Promise<Provider> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO providers (id, name, base_url, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, input.name, input.baseUrl, input.apiKey ?? null, now, now]
  );
  return { id, name: input.name, baseUrl: input.baseUrl, apiKey: input.apiKey ?? null, createdAt: now, updatedAt: now };
}

export async function updateProvider(
  id: string,
  input: Partial<Pick<Provider, "name" | "baseUrl" | "apiKey">>
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
  if (input.baseUrl !== undefined) { fields.push("base_url = ?"); values.push(input.baseUrl); }
  if (input.apiKey !== undefined) { fields.push("api_key = ?"); values.push(input.apiKey ?? null); }
  if (!fields.length) return;
  fields.push("updated_at = ?"); values.push(now);
  values.push(id);
  await db.execute(
    `UPDATE providers SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM providers WHERE id = ?", [id]);
}

// ---- Models (cached) ----

export async function listModels(providerId: string): Promise<ModelEntry[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM models WHERE provider_id = ? ORDER BY model_id ASC",
    [providerId]
  );
  return rows.map(rowToModel);
}

export async function replaceModels(
  providerId: string,
  models: { modelId: string; label?: string | null }[]
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  // Use INSERT OR IGNORE so existing rows (including starred state) are
  // preserved. Then delete rows for models that no longer appear remotely.
  for (const m of models) {
    await db.execute(
      "INSERT OR IGNORE INTO models (provider_id, model_id, label, created_at, starred, is_default) VALUES (?, ?, ?, ?, 0, 0)",
      [providerId, m.modelId, m.label ?? null, now]
    );
  }
  // Remove models that are no longer returned by the provider, but keep
  // starred models even if they disappear from the remote list.
  const remoteIds = models.map((m) => m.modelId);
  if (remoteIds.length > 0) {
    const placeholders = remoteIds.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM models WHERE provider_id = ? AND starred = 0 AND model_id NOT IN (${placeholders})`,
      [providerId, ...remoteIds]
    );
  } else {
    await db.execute(
      "DELETE FROM models WHERE provider_id = ? AND starred = 0",
      [providerId]
    );
  }
}

export async function toggleModelStar(
  modelDbId: number
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE models SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [modelDbId]
  );
}

export async function setDefaultModel(
  providerId: string,
  modelId: string
): Promise<void> {
  const db = await getDb();
  // Only one model globally can be the default — clear all first.
  await db.execute("UPDATE models SET is_default = 0");
  await db.execute(
    "UPDATE models SET is_default = 1 WHERE provider_id = ? AND model_id = ?",
    [providerId, modelId]
  );
}

export async function unsetDefaultModel(): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE models SET is_default = 0");
}

export async function getDefaultModel(): Promise<ModelEntry | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM models WHERE is_default = 1 LIMIT 1"
  );
  return rows.length > 0 ? rowToModel(rows[0]) : null;
}

// ---- Chats ----

export async function listChats(): Promise<Chat[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM chats ORDER BY updated_at DESC"
  );
  return rows.map(rowToChat);
}

export async function createChat(title = "New chat"): Promise<Chat> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO chats (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)",
    [id, title, now, now]
  );
  return { id, title, providerId: null, modelId: null, createdAt: now, updatedAt: now };
}

export async function updateChat(
  id: string,
  input: Partial<Pick<Chat, "title" | "providerId" | "modelId">>
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
  if (input.providerId !== undefined) { fields.push("provider_id = ?"); values.push(input.providerId); }
  if (input.modelId !== undefined) { fields.push("model_id = ?"); values.push(input.modelId); }
  if (!fields.length) return;
  fields.push("updated_at = ?"); values.push(now);
  values.push(id);
  await db.execute(
    `UPDATE chats SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function touchChat(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE chats SET updated_at = ? WHERE id = ?", [
    Date.now(),
    id,
  ]);
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM chats WHERE id = ?", [id]);
}

// ---- Messages ----

export async function listMessages(chatId: string): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
    [chatId]
  );
  return rows.map(rowToMessage);
}

export async function insertMessage(input: {
  chatId: string;
  role: MessageRole;
  content: string;
}): Promise<Message> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, input.chatId, input.role, input.content, now]
  );
  return { id, chatId: input.chatId, role: input.role, content: input.content, createdAt: now };
}

export async function updateMessageContent(
  id: string,
  content: string
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE messages SET content = ? WHERE id = ?", [
    content,
    id,
  ]);
}

// ---- Chat folders ----

export async function listChatFolders(chatId: string): Promise<ChatFolder[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM chat_folders WHERE chat_id = ? ORDER BY created_at ASC",
    [chatId]
  );
  return rows.map(rowToFolder);
}

export async function addChatFolder(input: {
  chatId: string;
  path: string;
  label?: string | null;
}): Promise<ChatFolder> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO chat_folders (id, chat_id, path, label, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, input.chatId, input.path, input.label ?? null, now]
  );
  return {
    id,
    chatId: input.chatId,
    path: input.path,
    label: input.label ?? null,
    createdAt: now,
  };
}

export async function removeChatFolder(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM chat_folders WHERE id = ?", [id]);
}

// ---- Tasks ----

export async function listTasks(chatId: string): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM tasks WHERE chat_id = ? ORDER BY created_at ASC",
    [chatId]
  );
  return rows.map(rowToTask);
}

export async function createTask(input: {
  chatId: string;
  title: string;
  description?: string;
  createdBy?: "user" | "manager";
  assigneeId?: string | null;
}): Promise<Task> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO tasks (id, chat_id, title, description, status, assignee_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)",
    [
      id,
      input.chatId,
      input.title,
      input.description ?? "",
      input.assigneeId ?? null,
      input.createdBy ?? "user",
      now,
      now,
    ]
  );
  return {
    id,
    chatId: input.chatId,
    title: input.title,
    description: input.description ?? "",
    status: "todo",
    assigneeId: input.assigneeId ?? null,
    createdBy: input.createdBy ?? "user",
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateTask(
  id: string,
  input: Partial<Pick<Task, "title" | "description" | "status" | "assigneeId">>
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
  if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
  if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
  if (input.assigneeId !== undefined) { fields.push("assignee_id = ?"); values.push(input.assigneeId); }
  if (!fields.length) return;
  fields.push("updated_at = ?"); values.push(now);
  values.push(id);
  await db.execute(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
}

// ---- Sub-agents ----

export async function listSubAgents(chatId: string): Promise<SubAgent[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM sub_agents WHERE chat_id = ? ORDER BY created_at ASC",
    [chatId]
  );
  return rows.map(rowToSubAgent);
}

export async function createSubAgent(input: {
  chatId: string;
  name: string;
  description?: string;
  providerId?: string | null;
  modelId?: string | null;
  systemPrompt?: string;
}): Promise<SubAgent> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO sub_agents (id, chat_id, name, description, provider_id, model_id, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      input.chatId,
      input.name,
      input.description ?? "",
      input.providerId ?? null,
      input.modelId ?? null,
      input.systemPrompt ?? "",
      now,
      now,
    ]
  );
  return {
    id,
    chatId: input.chatId,
    name: input.name,
    description: input.description ?? "",
    providerId: input.providerId ?? null,
    modelId: input.modelId ?? null,
    systemPrompt: input.systemPrompt ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateSubAgent(
  id: string,
  input: Partial<Pick<SubAgent, "name" | "description" | "providerId" | "modelId" | "systemPrompt">>
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
  if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
  if (input.providerId !== undefined) { fields.push("provider_id = ?"); values.push(input.providerId); }
  if (input.modelId !== undefined) { fields.push("model_id = ?"); values.push(input.modelId); }
  if (input.systemPrompt !== undefined) { fields.push("system_prompt = ?"); values.push(input.systemPrompt); }
  if (!fields.length) return;
  fields.push("updated_at = ?"); values.push(now);
  values.push(id);
  await db.execute(
    `UPDATE sub_agents SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteSubAgent(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sub_agents WHERE id = ?", [id]);
}

// ---- Agent runs ----

export async function listAgentRuns(chatId: string): Promise<AgentRun[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM agent_runs WHERE chat_id = ? ORDER BY started_at DESC",
    [chatId]
  );
  return rows.map(rowToAgentRun);
}

export async function createAgentRun(input: {
  chatId: string;
  subAgentId: string;
  taskId: string;
}): Promise<AgentRun> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO agent_runs (id, chat_id, sub_agent_id, task_id, status, started_at) VALUES (?, ?, ?, ?, 'running', ?)",
    [id, input.chatId, input.subAgentId, input.taskId, now]
  );
  return {
    id,
    chatId: input.chatId,
    subAgentId: input.subAgentId,
    taskId: input.taskId,
    status: "running",
    result: "",
    error: "",
    startedAt: now,
    endedAt: null,
  };
}

export async function updateAgentRun(
  id: string,
  input: Partial<Pick<AgentRun, "status" | "result" | "error" | "endedAt">>
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
  if (input.result !== undefined) { fields.push("result = ?"); values.push(input.result); }
  if (input.error !== undefined) { fields.push("error = ?"); values.push(input.error); }
  if (input.endedAt !== undefined) { fields.push("ended_at = ?"); values.push(input.endedAt); }
  if (!fields.length) return;
  values.push(id);
  await db.execute(
    `UPDATE agent_runs SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

// ---- Agent events ----

export async function listAgentEvents(chatId: string): Promise<AgentEvent[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM agent_events WHERE chat_id = ? ORDER BY created_at ASC",
    [chatId]
  );
  return rows.map(rowToAgentEvent);
}

export async function createAgentEvent(input: {
  chatId: string;
  runId?: string | null;
  direction: EventDirection;
  kind: EventKind;
  content: string;
  pending?: boolean;
}): Promise<AgentEvent> {
  const db = await getDb();
  const id = genId();
  const now = Date.now();
  await db.execute(
    "INSERT INTO agent_events (id, chat_id, run_id, direction, kind, content, pending, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      input.chatId,
      input.runId ?? null,
      input.direction,
      input.kind,
      input.content,
      input.pending ? 1 : 0,
      now,
    ]
  );
  return {
    id,
    chatId: input.chatId,
    runId: input.runId ?? null,
    direction: input.direction,
    kind: input.kind,
    content: input.content,
    pending: input.pending ?? false,
    createdAt: now,
    answeredAt: null,
  };
}

export async function answerAgentEvent(
  id: string,
  answerContent: string
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    "UPDATE agent_events SET pending = 0, answered_at = ? WHERE id = ?",
    [now, id]
  );
  // Insert the answer as a new event returned to the originating run.
  await db.execute(
    "INSERT INTO agent_events (id, chat_id, run_id, direction, kind, content, pending, created_at) " +
      "SELECT ?, chat_id, run_id, 'manager_to_sub', 'answer', ?, 0, ? FROM agent_events WHERE id = ?",
    [genId(), answerContent, now, id]
  );
}
