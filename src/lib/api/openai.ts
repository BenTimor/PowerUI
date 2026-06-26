import { fetch } from "@tauri-apps/plugin-http";

export interface RemoteModel {
  id: string;
  label?: string | null;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

/** Strip trailing slashes and ensure no double slashes before /v1. */
export function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  // If the user only gave a host without a path, leave as-is; we'll append /v1.
  while (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

/**
 * Decide whether the base URL already includes the /v1 path (or another API
 * version like /v2). If not, we append /v1.
 */
function joinModelsPath(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/(\/v\d+)$/i.test(base)) {
    return `${base}/models`;
  }
  return `${base}/v1/models`;
}

function joinChatPath(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/(\/v\d+)$/i.test(base)) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function authHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/** Fetch available models from an OpenAI-compatible /v1/models endpoint. */
export async function listRemoteModels(
  baseUrl: string,
  apiKey: string | null
): Promise<RemoteModel[]> {
  const url = joinModelsPath(baseUrl);
  const res = await fetch(url, {
    method: "GET",
    headers: { ...authHeaders(apiKey), Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to list models (${res.status}): ${text || res.statusText}`
    );
  }

  const data = (await res.json()) as {
    data?: Array<{ id: string }>;
    models?: Array<{ id: string; name?: string }>;
    id?: string;
  };

  const list: RemoteModel[] = [];
  const items = data.data ?? data.models ?? [];
  for (const m of items) {
    list.push({ id: m.id, label: (m as { name?: string }).name ?? m.id });
  }
  // Some endpoints return a single object; ignore those edge cases.
  return list.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Stream a chat completion, invoking onDelta for each text chunk.
 * Returns the full assembled text once the stream closes.
 */
export async function streamChatCompletion(opts: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  callbacks: StreamCallbacks;
}): Promise<string> {
  const { baseUrl, apiKey, model, messages, temperature, callbacks } = opts;
  const url = joinChatPath(baseUrl);

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(temperature !== undefined ? { temperature } : {}),
    }),
    signal: callbacks.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Chat request failed (${res.status}): ${text || res.statusText}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by double newlines.
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            return full;
          }
          try {
            const json = JSON.parse(payload);
            const delta =
              json?.choices?.[0]?.delta?.content ??
              json?.choices?.[0]?.message?.content ??
              "";
            if (delta) {
              full += delta;
              callbacks.onDelta(delta);
            }
          } catch {
            // ignore keep-alive / malformed lines
          }
        }
      }
    }
  }

  return full;
}
