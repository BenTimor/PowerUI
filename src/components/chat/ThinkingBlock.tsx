import { useState } from "react";
import {
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Brain,
  Wrench,
  ArrowDown,
} from "lucide-react";

import {
  useThinkingStore,
  summarizeTrace,
  toolLabel,
  type TraceStep,
} from "@/stores/thinkingStore";
import { cn } from "@/lib/utils";

/** A single stable empty-array reference, so the selector below never returns
 *  a fresh `[]` (which would make useSyncExternalStore loop infinitely). */
const NO_STEPS: TraceStep[] = [];

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max) + "…";
}

function StepRow({ step }: { step: TraceStep }) {
  if (step.kind === "thought") {
    return (
      <div className="flex gap-1.5 py-0.5 text-xs text-muted-foreground">
        <Brain className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
        <span className="whitespace-pre-wrap break-words">
          {truncate(step.text ?? "", 400)}
        </span>
      </div>
    );
  }
  if (step.kind === "tool_call") {
    let argSummary = "";
    if (step.toolArgs) {
      try {
        const parsed = JSON.parse(step.toolArgs) as Record<string, unknown>;
        const strVals = Object.entries(parsed)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => `${k}: ${truncate(typeof v === "string" ? v : JSON.stringify(v), 60)}`);
        argSummary = strVals.join(" · ");
      } catch {
        argSummary = truncate(step.toolArgs, 80);
      }
    }
    return (
      <div className="flex gap-1.5 py-0.5 text-xs">
        <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-blue-400/80" />
        <span className="text-foreground/90">
          <span className="font-medium text-blue-300">
            {toolLabel(step.toolName)}
          </span>
          {argSummary && (
            <span className="text-muted-foreground"> — {argSummary}</span>
          )}
        </span>
      </div>
    );
  }
  // tool_result
  const ok = !(step.toolResult ?? "").startsWith("Error:");
  return (
    <div className="flex gap-1.5 py-0.5 pl-4 text-xs text-muted-foreground">
      <ArrowDown
        className={cn(
          "mt-0.5 h-3 w-3 shrink-0",
          ok ? "text-emerald-400/70" : "text-red-400/80"
        )}
      />
      <span className="whitespace-pre-wrap break-words">
        {truncate(step.toolResult ?? "", 300)}
      </span>
    </div>
  );
}

export function ThinkingBlock({
  messageId,
  live,
}: {
  messageId: string;
  /** True while the manager turn is still active (auto-expanded, spinner). */
  live?: boolean;
}) {
  const steps = useThinkingStore((s) => s.traces[messageId] ?? NO_STEPS);
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  const summary = summarizeTrace(steps);
  const expanded = live || open;
  const toolCount = steps.filter((s) => s.kind === "tool_call").length;

  return (
    <div className="mb-2 rounded-lg border border-border/70 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={live}
        className={cn(
          "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs",
          live ? "cursor-default" : "hover:bg-muted/40"
        )}
      >
        {live ? (
          <span className="flex h-3.5 w-3.5 items-center justify-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          </span>
        ) : expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="truncate text-muted-foreground">
          {live ? (
            <>
              <span className="text-foreground/80">Working…</span>{" "}
              <span className="text-muted-foreground/80">·</span>{" "}
              {summary}
            </>
          ) : (
            <>
              <span className="font-medium text-foreground/70">
                Thinking
              </span>
              <span className="text-muted-foreground/70">
                {" "}
                · {toolCount} tool{toolCount === 1 ? "" : "s"} used
              </span>
              <span className="text-muted-foreground/70"> · </span>
              <span className="text-muted-foreground">{summary}</span>
            </>
          )}
        </span>
        {!live && (
          <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border/60 px-2.5 py-1.5">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      )}
    </div>
  );
}
