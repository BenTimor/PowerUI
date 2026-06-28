import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Bot,
  Brain,
  CheckCircle2,
  FastForward,
  Loader2,
  Pause,
  Play,
  Send,
  Square,
  Wrench,
} from "lucide-react";

import { useAgentActivityStore } from "@/stores/agentActivityStore";
import { useSubAgentsStore } from "@/stores/subAgentsStore";
import { useTasksStore } from "@/stores/tasksStore";
import { useChatsStore } from "@/stores/chatsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, elapsedSince, relTime } from "@/lib/utils";
import type { RunStep } from "@/types";

/** Human-readable label for a sub-agent tool name. */
function toolLabel(name?: string | null): string {
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

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max) + "…";
}

function StepRow({ step }: { step: RunStep }) {
  // Lifecycle markers render as centered dividers.
  if (step.kind === "paused" || step.kind === "resumed" || step.kind === "steered") {
    const label =
      step.kind === "paused"
        ? "paused"
        : step.kind === "resumed"
          ? "resumed"
          : "steered";
    return (
      <div className="my-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">
        <div className="h-px flex-1 bg-border/60" />
        {step.text && <span className="truncate">{truncate(step.text, 120)}</span>}
        <span className="font-medium">{label}</span>
        <div className="h-px flex-1 bg-border/60" />
      </div>
    );
  }

  if (step.kind === "thought") {
    return (
      <div className="flex gap-1.5 py-0.5 text-xs text-muted-foreground">
        <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="whitespace-pre-wrap break-words leading-relaxed">
          {step.text}
        </span>
      </div>
    );
  }

  if (step.kind === "assistant_text") {
    return (
      <div className="flex gap-1.5 py-1 text-sm">
        <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/70" />
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {step.text}
        </div>
      </div>
    );
  }

  if (step.kind === "finished") {
    return (
      <div className="my-1 flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span className="truncate">completed: {truncate(step.text || "(no summary)", 400)}</span>
      </div>
    );
  }

  if (step.kind === "error") {
    return (
      <div className="my-1 flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="whitespace-pre-wrap break-words">{step.text}</span>
      </div>
    );
  }

  // tool_call
  if (step.kind === "tool_call") {
    let argSummary = "";
    if (step.toolArgs) {
      try {
        const parsed = JSON.parse(step.toolArgs) as Record<string, unknown>;
        const strVals = Object.entries(parsed)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) =>
            `${k}: ${truncate(typeof v === "string" ? v : JSON.stringify(v), 80)}`
          );
        argSummary = strVals.join(" · ");
      } catch {
        argSummary = truncate(step.toolArgs, 120);
      }
    }
    return (
      <div className="flex gap-1.5 py-0.5 text-xs">
        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400/80" />
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
  if (step.kind === "tool_result") {
    const ok = !(step.toolResult ?? "").startsWith("Error:");
    return (
      <div className="flex gap-1.5 py-0.5 pl-4 text-xs text-muted-foreground">
        <ArrowDown
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            ok ? "text-emerald-400/70" : "text-red-400/80"
          )}
        />
        <span className="whitespace-pre-wrap break-words leading-relaxed">
          {step.toolResult}
        </span>
      </div>
    );
  }

  return null;
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
        {label}
      </span>
      <span className="text-xs text-foreground/80">{value}</span>
    </div>
  );
}

function SteerBar({ runId }: { runId: string }) {
  const steerRun = useAgentActivityStore((s) => s.steerRun);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try {
      await steerRun(runId, msg.trim());
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-1 px-3 pb-2">
      <Input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder='Steer this sub-agent…  (e.g. also add a test)'
        className="h-8 text-xs"
        disabled={busy}
      />
      <Button
        size="icon"
        variant="secondary"
        className="h-8 w-8 shrink-0"
        disabled={!msg.trim() || busy}
        onClick={submit}
        title="Send steering message"
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function WakeBar({ runId }: { runId: string }) {
  const wakeRun = useAgentActivityStore((s) => s.wakeRun);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const wake = async () => {
    const instruction = msg.trim() || "Continue working on this task.";
    setBusy(true);
    try {
      await wakeRun(runId, instruction);
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="mb-1.5 text-[11px] text-muted-foreground">
        This sub-agent is inactive. Wake it to continue on the same thread.
      </div>
      <div className="flex gap-1">
        <Input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void wake();
            }
          }}
          placeholder="How should it continue?  (Enter to wake)"
          className="h-8 text-xs"
          disabled={busy}
        />
        <Button
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          disabled={busy}
          onClick={wake}
          title="Wake sub-agent"
        >
          <FastForward className="h-3.5 w-3.5" /> Wake
        </Button>
      </div>
    </div>
  );
}

export function SubAgentTraceView({ onBack }: { onBack: () => void }) {
  const selectedRunId = useAgentActivityStore((s) => s.selectedRunId);
  const steps = useAgentActivityStore((s) => s.steps);
  const overview = useAgentActivityStore((s) => s.overview);
  const runs = useAgentActivityStore((s) => s.runs);
  const cancelRun = useAgentActivityStore((s) => s.cancelRun);

  const tasks = useTasksStore((s) => s.tasks);
  const subAgents = useSubAgentsStore((s) => s.subAgents);
  const selectChat = useChatsStore((s) => s.selectChat);

  const scrollRef = useRef<HTMLDivElement>(null);

  // The selected run can live in either `runs` (open chat) or `overview`.
  const run = useMemo(
    () =>
      [...runs, ...overview].find((r) => r.id === selectedRunId) ?? null,
    [runs, overview, selectedRunId]
  );

  const subAgent = run
    ? subAgents.find((a) => a.id === run.subAgentId)
    : undefined;
  const task = run ? tasks.find((t) => t.id === run.taskId) : undefined;
  const isRunning = run?.status === "running";

  // Auto-scroll to bottom on new steps while running.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps, isRunning]);

  if (!selectedRunId || !run) {
    // Nothing selected — shouldn't happen (App routes here only when a run is
    // selected), but render a safe fallback.
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        No sub-agent selected.
      </div>
    );
  }

  const toolCount = steps.filter(
    (s) => s.kind === "tool_call"
  ).length;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
          title="Back to chat"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              isRunning
                ? "bg-blue-500/15 text-blue-300"
                : run.status === "completed"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : run.status === "failed"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
            )}
          >
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {subAgent?.name ?? run.subAgentId.slice(0, 8)}
              {isRunning ? (
                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
              ) : run.status === "completed" ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              ) : run.status === "failed" ? (
                <AlertCircle className="h-3 w-3 text-destructive" />
              ) : (
                <Pause className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              on {task?.title ?? run.taskId}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <HeaderStat
            label="tools"
            value={String(toolCount)}
          />
          <HeaderStat
            label="started"
            value={relTime(run.startedAt)}
          />
          <HeaderStat
            label={isRunning ? "running" : "elapsed"}
            value={
              isRunning
                ? elapsedSince(run.startedAt)
                : run.endedAt
                  ? elapsedSince(run.startedAt)
                  : "—"
            }
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => selectChat(run.chatId)}
            title="Open parent chat"
          >
            <Play className="h-3 w-3" /> Chat
          </Button>
        </div>
      </div>

      {/* Action toolbar (stop while running) */}
      {isRunning && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
            onClick={() => cancelRun(run.id)}
            title="Stop this sub-agent"
          >
            <Square className="h-3 w-3" /> Stop
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Stopping pauses the run; you can wake it again later to resume on
            the same thread.
          </span>
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {steps.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {isRunning
                ? "Sub-agent is starting…"
                : "No trace recorded for this run."}
            </div>
          ) : (
            <div className="space-y-0.5">
              {steps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
              {isRunning && (
                <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>working…</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer: steer bar (running) or wake bar (inactive) */}
      {isRunning ? (
        <SteerBar runId={run.id} />
      ) : (
        <WakeBar runId={run.id} />
      )}
    </div>
  );
}
