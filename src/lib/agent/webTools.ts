import type { Tool } from "@/lib/agent/types";
import {
  exaFetchContents,
  exaSearch,
  formatExaFetchedContent,
  formatExaSearchResults,
  type ExaSearchType,
} from "@/lib/api/exa";
import { useProvidersStore } from "@/stores/providersStore";

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function boolArg(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true || args[key] === "true";
}

function numArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function getExaApiKey(): string | null {
  return useProvidersStore.getState().exaApiKey;
}

const searchTypes = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"] as const;

export function buildExaWebTools(): Tool[] {
  const web_search: Tool = {
    name: "web_search",
    description:
      "Search the web using Exa. Use this for current information, external documentation, or facts not available in the workspace. Return and cite URLs in your final answer when you rely on results.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        num_results: { type: "number", description: "Number of results, 1-10 (default 5)." },
        search_type: {
          type: "string",
          enum: [...searchTypes],
          description: "Exa search type. Use auto unless latency or depth requires another mode.",
        },
        include_domains: { type: "array", items: { type: "string" } },
        exclude_domains: { type: "array", items: { type: "string" } },
        live: { type: "boolean", description: "Force fresh live-crawled contents when true." },
      },
      required: ["query"],
    },
    async execute(args) {
      const apiKey = getExaApiKey();
      if (!apiKey) {
        return "Error: Exa API key is not configured. Open Providers settings and save an Exa API key.";
      }
      const query = strArg(args, "query").trim();
      if (!query) return "Error: query is required";
      const requestedType = strArg(args, "search_type") as ExaSearchType;
      const type = searchTypes.includes(requestedType) ? requestedType : "auto";
      try {
        const results = await exaSearch({
          apiKey,
          query,
          numResults: numArg(args, "num_results", 5),
          type,
          includeDomains: stringArrayArg(args, "include_domains"),
          excludeDomains: stringArrayArg(args, "exclude_domains"),
          live: boolArg(args, "live"),
        });
        return formatExaSearchResults(results);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const web_fetch: Tool = {
    name: "web_fetch",
    description:
      "Fetch readable page contents for a URL using Exa. Use after web_search when you need deeper source context. Cite the URL in your final answer when you rely on the fetched content.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        max_characters: { type: "number", description: "Maximum page text characters, 1000-30000 (default 12000)." },
        live: { type: "boolean", description: "Force fresh live-crawled contents when true." },
      },
      required: ["url"],
    },
    async execute(args) {
      const apiKey = getExaApiKey();
      if (!apiKey) {
        return "Error: Exa API key is not configured. Open Providers settings and save an Exa API key.";
      }
      const url = strArg(args, "url").trim();
      if (!url) return "Error: url is required";
      try {
        const { result, status } = await exaFetchContents({
          apiKey,
          url,
          maxCharacters: numArg(args, "max_characters", 12000),
          live: boolArg(args, "live"),
        });
        if (status && !result) return `Error: Exa could not fetch ${url}: ${status}`;
        if (!result) return "Error: Exa returned no content for that URL";
        const formatted = formatExaFetchedContent(result);
        return status ? `${formatted}\n\n[Exa status: ${status}]` : formatted;
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  return [web_search, web_fetch];
}

