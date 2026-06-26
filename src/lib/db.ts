import Database from "@tauri-apps/plugin-sql";

import type {
  Chat,
  Message,
  MessageRole,
  ModelEntry,
  Provider,
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
  await db.execute("DELETE FROM models WHERE provider_id = ?", [providerId]);
  for (const m of models) {
    await db.execute(
      "INSERT OR IGNORE INTO models (provider_id, model_id, label, created_at) VALUES (?, ?, ?, ?)",
      [providerId, m.modelId, m.label ?? null, now]
    );
  }
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
