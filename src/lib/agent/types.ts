import {
  chatCompletion,
  type LoopMessage,
  type ToolDefinition,
} from "@/lib/api/openai";

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export type AgentEventKind =
  | "thought"
  | "assistant_text"
  | "tool_call"
  | "tool_result"
  | "finished"
  | "error";

export interface AgentLoopEvent {
  kind: AgentEventKind;
  text?: string; // thought / assistant_text / error message
  toolName?: string; // tool_call
  toolArgs?: string; // tool_call (raw arguments string)
  toolResult?: string; // tool_result (truncated, <=2000 chars)
  finalText?: string; // finished
  error?: string; // error
}

export interface RunAgentOptions {
  systemPrompt: string;
  model: { baseUrl: string; apiKey: string | null; modelId: string };
  tools: Tool[];
  userMessage: string; // the first user message (task briefing)
  maxTurns?: number; // default 25
  signal?: AbortSignal;
  onEvent?: (e: AgentLoopEvent) => void;
  /** Optional mailbox drained at the top of each turn. Returned messages are
   *  appended to the working message list BEFORE the next model call, so an
   *  external caller can inject information into a running loop. */
  /** Optional mailbox drained at the top of each turn. Returned messages are
   *  appended to the working message list BEFORE the next model call, so an
   *  external caller can inject information into a running loop. */
  mailbox?: () => LoopMessage[];
  /** Optional pre-built message list (including a system message). If
   *  provided, REPLACES the default [system, userMessage] construction. */
  initialMessages?: LoopMessage[];
}

export interface RunAgentResult {
  finalText: string;
}

const MAX_RESULT = 2000;

function truncate(s: string, max = MAX_RESULT): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/**
 * Run an OpenAI-compatible model in a tool-calling loop until completion.
 * Stops when the model produces a message without tool_calls, when the
 * `complete_task` tool is invoked, when maxTurns is exceeded, or when the
 * signal is aborted.
 */
export async function runAgentLoop(
  opts: RunAgentOptions
): Promise<RunAgentResult> {
  const {
    systemPrompt,
    model,
    tools,
    userMessage,
    signal,
    onEvent,
    mailbox,
  } = opts;
  const maxTurns = opts.maxTurns ?? 25;
  const emit = (e: AgentLoopEvent) => onEvent?.(e);
  const toolDefs = tools.map(toToolDefinition);
  const byName = new Map(tools.map((t) => [t.name, t] as const));

  const messages: LoopMessage[] = opts.initialMessages
    ? [...opts.initialMessages]
    : [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ];

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }

    // Drain any injected mailbox messages before the next model call.
    if (mailbox) {
      const injected = mailbox();
      if (injected.length > 0) {
        messages.push(...injected);
      }
    }

    const assistant = await chatCompletion({
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.modelId,
      messages,
      tools: toolDefs,
      signal,
    });
    messages.push(assistant);

    const calls = assistant.tool_calls ?? [];
    const content =
      typeof assistant.content === "string" ? assistant.content : "";
    const hasContent = content !== "";

    if (calls.length === 0) {
      // Terminal turn. A genuinely empty response (no content AND no tool
      // calls) is a degenerate model output — don't terminate on it, or the
      // caller surfaces an empty message. Nudge once and continue; maxTurns
      // guards against infinite empties. This implements the "no-progress"
      // recovery described in agent-loop literature.
      if (!hasContent) {
        emit({
          kind: "thought",
          text: "(model returned an empty response; nudging for an answer)",
        });
        messages.push({
          role: "user",
          content:
            "You returned an empty response. Please either answer the user directly with your final reply, or call a tool to make progress. Do not return an empty message.",
        });
        continue;
      }
      // Real terminal answer.
      emit({ kind: "assistant_text", text: content });

      // Before truly terminating, drain the mailbox one last time. If
      // events arrived during this final model call (e.g. a sub-agent
      // completed while we were answering), inject them and continue so
      // the manager reacts to them instead of silently dropping them.
      if (mailbox) {
        const late = mailbox();
        if (late.length > 0) {
          messages.push(...late);
          continue;
        }
      }

      emit({ kind: "finished", finalText: content });
      return { finalText: content };
    }

    // Non-terminal turn with tool calls. Any accompanying text is a ReAct
    // "thought" — it stays in the transcript (pushed above) for the model's
    // next-turn coherence, but is surfaced separately so callers can show it
    // as transient reasoning rather than a finished message.
    if (hasContent) emit({ kind: "thought", text: content });

    for (const call of calls) {
      emit({
        kind: "tool_call",
        toolName: call.function.name,
        toolArgs: call.function.arguments,
      });

      const tool = byName.get(call.function.name);
      let result: string;
      if (!tool) {
        result = `Error: unknown tool ${call.function.name}`;
      } else {
        try {
          const args = JSON.parse(call.function.arguments) as Record<
            string,
            unknown
          >;
          result = await tool.execute(args);
        } catch (err) {
          result =
            err instanceof Error
              ? `Error: ${err.message}`
              : `Error: ${String(err)}`;
        }
      }
      result = truncate(result);
      emit({
        kind: "tool_result",
        toolName: call.function.name,
        toolResult: result,
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });

      if (call.function.name === "complete_task") {
        const summary = result !== "task_completed" ? result : "";
        emit({ kind: "finished", finalText: summary });
        return { finalText: summary };
      }
    }
  }

  // Exceeded maxTurns without a terminal message.
  return { finalText: "" };
}
