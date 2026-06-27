import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Play,
  Send,
  Square,
  X,
} from "lucide-react";

import { useAgentActivityStore } from "@/stores/agentActivityStore";
import { useSubAgentsStore } from "@/stores/subAgentsStore";
import { useTasksStore } from "@/stores/tasksStore";
import { useChatsStore } from "@/stores/chatsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Resolve the sub-agent name for a run/event, if any. */
function useSubAgentName(id: string | null | undefined): string {
  return useSubAgentsStore((s) => {
    if (!id) return "";
    return s.subAgents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  });
}

function RunRow({ runId }: { runId: string }) {
  const run = useAgentActivityStore((s) => s.runs.find((r) => r.id === runId));
  const cancelRun = useAgentActivityStore((s) => s.cancelRun);
  const name = useSubAgentName(run?.subAgentId);
  const taskTitle = useTasksStore(
    (s) => s.tasks.find((t) => t.id === run?.taskId)?.title ?? run?.taskId ?? ""
  );
  if (!run) return null;
  const active = run.status === "running";
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card/50 p-2 text-xs">
      <div className="mt-0.5">
        {active ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
        ) : run.status === "completed" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : run.status === "failed" ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Square className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {name} <span className="text-muted-foreground">on</span>{" "}
          {taskTitle}
        </div>
        <div className="text-muted-foreground">
          {run.status}
          {run.error ? ` — ${run.error}` : ""}
        </div>
      </div>
      {active && (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => cancelRun(run.id)}
          title="Cancel run"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function PendingQuestion({
  eventId,
  content,
  runId,
}: {
  eventId: string;
  content: string;
  runId: string | null;
}) {
  const answerQuestion = useAgentActivityStore((s) => s.answerQuestion);
  const name = useSubAgentName(
    useAgentActivityStore((s) => s.runs.find((r) => r.id === runId)?.subAgentId)
  );
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await answerQuestion(eventId, answer.trim());
      setAnswer("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-300">
        <AlertCircle className="h-3.5 w-3.5" />
        {name ? `${name} asks:` : "Sub-agent asks:"}
      </div>
      <p className="mb-2 text-foreground/90">{content}</p>
      <div className="flex gap-1">
        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Your answer…"
          className="h-7 text-xs"
          disabled={busy}
        />
        <Button
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={!answer.trim() || busy}
          onClick={submit}
          title="Send answer"
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function LaunchControl() {
  const allTasks = useTasksStore((s) => s.tasks);
  const tasks = allTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );
  const subAgents = useSubAgentsStore((s) => s.subAgents);
  const launchSubAgent = useAgentActivityStore((s) => s.launchSubAgent);
  const currentChatId = useChatsStore((s) => s.currentChatId);

  const [taskId, setTaskId] = useState("");
  const [subAgentId, setSubAgentId] = useState("");
  const [busy, setBusy] = useState(false);

  const canLaunch = !!taskId && !!subAgentId && !!currentChatId;

  const launch = async () => {
    if (!canLaunch) return;
    setBusy(true);
    try {
      await launchSubAgent(currentChatId!, subAgentId, taskId);
      setTaskId("");
      setSubAgentId("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/50 p-2 text-xs">
      <div className="mb-1.5 font-medium text-muted-foreground">
        Manually launch
      </div>
      <Select value={taskId} onValueChange={setTaskId}>
        <SelectTrigger className="mb-1 h-7 text-xs">
          <SelectValue placeholder="Task…" />
        </SelectTrigger>
        <SelectContent>
          {tasks.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={subAgentId} onValueChange={setSubAgentId}>
        <SelectTrigger className="mb-1.5 h-7 text-xs">
          <SelectValue placeholder="Sub-agent…" />
        </SelectTrigger>
        <SelectContent>
          {subAgents.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 w-full text-xs"
        disabled={!canLaunch || busy}
        onClick={launch}
      >
        <Play className="h-3 w-3" /> Launch
      </Button>
    </div>
  );
}

/** Render a single event line in the log. */
function EventLine({
  kind,
  direction,
  content,
  createdAt,
}: {
  kind: string;
  direction: string;
  content: string;
  createdAt: number;
}) {
  const icon =
    kind === "started" ? (
      <Play className="h-3 w-3 text-blue-400" />
    ) : kind === "task_complete" ? (
      <CheckCircle2 className="h-3 w-3 text-green-500" />
    ) : kind === "question" ? (
      <AlertCircle className="h-3 w-3 text-amber-400" />
    ) : kind === "answer" ? (
      <MessageSquare className="h-3 w-3 text-muted-foreground" />
    ) : (
      <MessageSquare className="h-3 w-3 text-muted-foreground" />
    );
  return (
    <div className="flex items-start gap-1.5 px-1 py-1 text-xs">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground">
          {new Date(createdAt).toLocaleTimeString()}
        </span>{" "}
        <span
          className={cn(
            "rounded px-1",
            direction === "sub_to_user" && "bg-muted/50",
            direction === "sub_to_manager" && "bg-blue-500/10"
          )}
        >
          {direction}
        </span>
        <p className="whitespace-pre-wrap break-words text-foreground/80">
          {content}
        </p>
      </div>
    </div>
  );
}

export function ActivityPanel() {
  const events = useAgentActivityStore((s) => s.events);
  const runs = useAgentActivityStore((s) => s.runs);

  const pendingQuestions = events.filter(
    (e) => e.kind === "question" && e.pending
  );
  const activeRuns = runs.filter((r) => r.status === "running");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Activity
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2">
          {pendingQuestions.length > 0 && (
            <div className="space-y-2">
              {pendingQuestions.map((q) => (
                <PendingQuestion
                  key={q.id}
                  eventId={q.id}
                  content={q.content}
                  runId={q.runId}
                />
              ))}
            </div>
          )}

          {activeRuns.length > 0 && (
            <div className="space-y-1.5">
              {activeRuns.map((r) => (
                <RunRow key={r.id} runId={r.id} />
              ))}
            </div>
          )}

          <LaunchControl />

          <div className="pt-1">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Event log
            </div>
            {events.length === 0 ? (
              <div className="px-1 py-4 text-center text-xs text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              <div className="space-y-0.5">
                {events.map((e) => (
                  <EventLine
                    key={e.id}
                    kind={e.kind}
                    direction={e.direction}
                    content={e.content}
                    createdAt={e.createdAt}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
