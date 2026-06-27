import { create } from "zustand";

import type { AgentLoopEvent } from "@/lib/agent/types";

export type StepKind = "thought" | "tool_call" | "tool_result";

export interface TraceStep {
  id: string;
  kind: StepKind;
  /** For thoughts: the model's reasoning text. */
  text?: string;
  /** For tool_call / tool_result: the tool name. */
  toolName?: string;
  /** For tool_call: the raw arguments string. */
  toolArgs?: string;
  /** For tool_result: the (truncated) result string. */
  toolResult?: string;
  ts: number;
}

interface ThinkingState {
  /** Per assistant-message-id trace of steps. Persists in-memory for the
   *  session so the block remains visible (collapsible) in scroll history. */
  traces: Record<string, TraceStep[]>;
  /** Begin a new trace for an assistant message id. */
  begin(messageId: string): void;
  /** Append a loop event to the trace for the given message id. */
  append(messageId: string, e: AgentLoopEvent): void;
  /** Drop a trace (e.g. on message deletion). */
  clear(messageId: string): void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `step-${seq}-${Date.now().toString(36)}`;
}

/** Human-readable label for a tool name, used in collapsed summaries. */
export function toolLabel(name?: string): string {
  if (!name) return "tool";
  switch (name) {
    case "read_file":
      return "read file";
    case "list_files":
      return "list files";
    case "write_file":
      return "write file";
    case "edit_file":
      return "edit file";
    case "delete_file":
      return "delete file";
    case "create_task":
      return "create task";
    case "list_tasks":
      return "list tasks";
    case "assign_task":
      return "assign task";
    case "update_task":
      return "update task";
    case "create_sub_agent":
      return "create sub-agent";
    case "update_sub_agent":
      return "update sub-agent";
    case "list_sub_agents":
      return "list sub-agents";
    case "list_folders":
      return "list folders";
    case "answer_question":
      return "answer question";
    case "send_message_to_manager":
      return "messaged manager";
    case "ask_manager":
      return "asked manager";
    case "complete_task":
      return "completed task";
    default:
      return name;
  }
}

export const useThinkingStore = create<ThinkingState>((set) => ({
  traces: {},

  begin: (messageId) =>
    set((s) => ({ traces: { ...s.traces, [messageId]: [] } })),

  append: (messageId, e) => {
    let step: TraceStep | null = null;
    if (e.kind === "thought" && e.text) {
      step = { id: nextId(), kind: "thought", text: e.text, ts: Date.now() };
    } else if (e.kind === "tool_call") {
      step = {
        id: nextId(),
        kind: "tool_call",
        toolName: e.toolName,
        toolArgs: e.toolArgs,
        ts: Date.now(),
      };
    } else if (e.kind === "tool_result") {
      step = {
        id: nextId(),
        kind: "tool_result",
        toolName: e.toolName,
        toolResult: e.toolResult,
        ts: Date.now(),
      };
    }
    if (!step) return;
    set((s) => {
      const existing = s.traces[messageId];
      // Lazily begin if missing (e.g. events arrived before begin()).
      const next = existing ? [...existing, step as TraceStep] : [step as TraceStep];
      return { traces: { ...s.traces, [messageId]: next } };
    });
  },

  clear: (messageId) =>
    set((s) => {
      const traces = { ...s.traces };
      delete traces[messageId];
      return { traces };
    }),
}));

/** Build the collapsed one-line summary for a trace. */
export function summarizeTrace(steps: TraceStep[]): string {
  const toolCalls = steps.filter((s) => s.kind === "tool_call");
  if (toolCalls.length === 0) {
    const thoughts = steps.filter((s) => s.kind === "thought");
    if (thoughts.length === 0) return "Working…";
    return thoughts[thoughts.length - 1].text ?? "Thinking…";
  }
  // Group tool calls by label to produce "read 2 files, created 1 task".
  const counts = new Map<string, number>();
  for (const s of toolCalls) {
    const label = toolLabel(s.toolName);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, n]) =>
    n > 1 ? `${label} ×${n}` : label
  );
  return `Used ${toolCalls.length} tool${toolCalls.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}
