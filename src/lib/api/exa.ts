import { fetch } from "@tauri-apps/plugin-http";

export type ExaSearchType =
  | "auto"
  | "fast"
  | "instant"
  | "deep-lite"
  | "deep"
  | "deep-reasoning";

export interface ExaResult {
  id?: string;
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

interface ExaResponse {
  results?: ExaResult[];
  statuses?: Array<{
    id: string;
    status: "success" | "error";
    error?: { tag?: string; httpStatusCode?: number };
  }>;
}

const EXA_BASE_URL = "https://api.exa.ai";

async function postExa<T>(
  path: "/search" | "/contents",
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${EXA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Exa request failed (${res.status}): ${text || res.statusText}`
    );
  }

  return (await res.json()) as T;
}

export async function exaSearch(opts: {
  apiKey: string;
  query: string;
  numResults?: number;
  type?: ExaSearchType;
  includeDomains?: string[];
  excludeDomains?: string[];
  live?: boolean;
  signal?: AbortSignal;
}): Promise<ExaResult[]> {
  const body: Record<string, unknown> = {
    query: opts.query,
    type: opts.type ?? "auto",
    numResults: Math.max(1, Math.min(opts.numResults ?? 5, 10)),
    contents: {
      highlights: true,
      ...(opts.live ? { maxAgeHours: 0 } : {}),
    },
  };
  if (opts.includeDomains?.length) body.includeDomains = opts.includeDomains;
  if (opts.excludeDomains?.length) body.excludeDomains = opts.excludeDomains;

  const data = await postExa<ExaResponse>(
    "/search",
    opts.apiKey,
    body,
    opts.signal
  );
  return data.results ?? [];
}

export async function exaFetchContents(opts: {
  apiKey: string;
  url: string;
  maxCharacters?: number;
  live?: boolean;
  signal?: AbortSignal;
}): Promise<{ result: ExaResult | null; status?: string }> {
  const body: Record<string, unknown> = {
    ids: [opts.url],
    text: { maxCharacters: Math.max(1000, Math.min(opts.maxCharacters ?? 12000, 30000)) },
    ...(opts.live ? { maxAgeHours: 0 } : {}),
  };
  const data = await postExa<ExaResponse>(
    "/contents",
    opts.apiKey,
    body,
    opts.signal
  );
  const status = data.statuses?.[0];
  if (status?.status === "error") {
    const tag = status.error?.tag ?? "unknown";
    const code = status.error?.httpStatusCode;
    return { result: data.results?.[0] ?? null, status: `${tag}${code ? ` (${code})` : ""}` };
  }
  return { result: data.results?.[0] ?? null };
}

export function formatExaSearchResults(results: ExaResult[]): string {
  if (results.length === 0) return "(no results)";
  return results
    .map((r, i) => {
      const lines = [
        `${i + 1}. ${r.title || "Untitled"}`,
        `   URL: ${r.url}`,
      ];
      if (r.publishedDate) lines.push(`   Published: ${r.publishedDate}`);
      if (r.author) lines.push(`   Author: ${r.author}`);
      if (r.highlights?.length) {
        lines.push("   Highlights:");
        for (const h of r.highlights) lines.push(`   - ${h}`);
      } else if (r.summary) {
        lines.push(`   Summary: ${r.summary}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function formatExaFetchedContent(result: ExaResult): string {
  const lines = [result.title || "Untitled", `URL: ${result.url}`, ""];
  if (result.publishedDate) lines.splice(2, 0, `Published: ${result.publishedDate}`);
  lines.push(result.text || result.summary || result.highlights?.join("\n\n") || "(no content returned)");
  return lines.join("\n");
}

