import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pencil,
  Settings2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useChatsStore } from "@/stores/chatsStore";
import { useAgentActivityStore } from "@/stores/agentActivityStore";
import { useSubAgentsStore } from "@/stores/subAgentsStore";
import { useTasksStore } from "@/stores/tasksStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, elapsedSince, relTime } from "@/lib/utils";
import type { AgentRun } from "@/types";

/** How many recent finished runs to show under each chat (collapsed). */
const MAX_FINISHED_RUNS = 4;

function StatusIcon({
  status,
  className,
}: {
  status: AgentRun["status"];
  className?: string;
}) {
  const map: Record<AgentRun["status"], { Icon: LucideIcon; cls: string }> = {
    running: { Icon: Loader2, cls: "text-blue-400" },
    completed: { Icon: CheckCircle2, cls: "text-green-500" },
    failed: { Icon: AlertCircle, cls: "text-destructive" },
    cancelled: { Icon: Square, cls: "text-muted-foreground" },
  };
  const { Icon, cls } = map[status];
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", cls, className)} />;
}

/** A one-line preview of the most recent step for a run (for the collapsed
 *  sidebar row). Returns null when no steps are resolvable from memory. */
/** A single stable empty-array reference, so the zustand selector below
 *  never returns a fresh `[]` (which would cause an infinite re-render loop
 *  with useSyncExternalStore, React error #185). */
const NO_STEPS: never[] = [];

function useRunPreview(runId: string | undefined): string | null {
  const steps = useAgentActivityStore((s) =>
    s.selectedRunId === runId ? s.steps : NO_STEPS
  );
  return useMemo(() => {
    if (steps.length === 0) return null;
    const last = steps[steps.length - 1];
    if (last.kind === "tool_call" && last.toolName) {
      return last.toolArgs
        ? `${last.toolName}(${shortArgs(last.toolArgs)})`
        : last.toolName;
    }
    if (last.kind === "tool_result" && last.toolResult) {
      return `→ ${firstLine(last.toolResult)}`;
    }
    if (last.kind === "thought" && last.text) return firstLine(last.text);
    if (last.kind === "assistant_text" && last.text) return firstLine(last.text);
    return null;
  }, [steps]);
}

function shortArgs(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const vals = Object.entries(parsed)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) =>
        `${k}: ${truncate(typeof v === "string" ? v : JSON.stringify(v), 30)}`
      );
    return truncate(vals.join(", "), 60);
  } catch {
    return truncate(raw, 60);
  }
}

function firstLine(s: string): string {
  return truncate(s.replace(/\s+/g, " ").trim(), 80);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function RunRow({
  run,
  depth,
  isActiveChat,
}: {
  run: AgentRun;
  depth: number;
  isActiveChat: boolean;
}) {
  const selectedRunId = useAgentActivityStore((s) => s.selectedRunId);
  const selectRun = useAgentActivityStore((s) => s.selectRun);
  const cancelRun = useAgentActivityStore((s) => s.cancelRun);

  const subAgentName = useSubAgentsStore((s) => {
    const a = s.subAgents.find((x) => x.id === run.subAgentId);
    return a?.name ?? run.subAgentId.slice(0, 8);
  });
  const taskTitle = useTasksStore(
    (s) => s.tasks.find((t) => t.id === run.taskId)?.title ?? ""
  );

  const isRunning = run.status === "running";
  const isSelected = selectedRunId === run.id;
  const preview = useRunPreview(isSelected ? run.id : undefined);

  const name = subAgentName;

  return (
    <div
      className={cn(
        "group/run relative flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-1 transition-colors",
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : isActiveChat
            ? "hover:bg-sidebar-accent/50"
            : "hover:bg-sidebar-accent/40"
      )}
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      {isRunning ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
      ) : (
        <StatusIcon status={run.status} />
      )}
      <button
        className="min-w-0 flex-1 text-left"
        onClick={() => selectRun(run.id)}
        title={`${name} · ${taskTitle}`}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-xs font-medium">{name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {isRunning
              ? elapsedSince(run.startedAt)
              : relTime(run.endedAt ?? run.startedAt)}
          </span>
        </div>
        {taskTitle && (
          <div className="truncate text-[11px] text-muted-foreground">
            {taskTitle}
          </div>
        )}
        {isRunning && preview && (
          <div className="truncate text-[10px] text-blue-400/70">{preview}</div>
        )}
      </button>
      {isRunning && (
        <button
          className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded p-1 text-muted-foreground opacity-60 hover:bg-sidebar-accent hover:text-destructive hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            cancelRun(run.id);
          }}
          title="Stop sub-agent"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function ChatNode({ chatId }: { chatId: string }) {
  const chats = useChatsStore((s) => s.chats);
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const selectChat = useChatsStore((s) => s.selectChat);
  const removeChat = useChatsStore((s) => s.removeChat);
  const renameChat = useChatsStore((s) => s.renameChat);
  const selectedRunId = useAgentActivityStore((s) => s.selectedRunId);

  const overview = useAgentActivityStore((s) => s.overview);
  const selectRun = useAgentActivityStore((s) => s.selectRun);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const chat = chats.find((c) => c.id === chatId);
  // All runs for this chat, newest first (the overview is already global-newest).
  const chatRuns = useMemo(
    () => overview.filter((r) => r.chatId === chatId),
    [overview, chatId]
  );
  const activeRuns = chatRuns.filter((r) => r.status === "running");
  const finishedRuns = chatRuns.filter((r) => r.status !== "running");

  // A chat is "expanded" if it's the active chat OR if it has running runs
  // OR if any of its runs is selected in the trace view.
  const hasActiveRun = activeRuns.length > 0;
  const hasSelectedRun =
    !!selectedRunId && chatRuns.some((r) => r.id === selectedRunId);
  const isActiveChat = chatId === currentChatId;

  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const expanded =
    manualToggle ??
    (isActiveChat || hasActiveRun || hasSelectedRun);

  const commitRename = async (id: string) => {
    const v = renameValue.trim();
    if (v) await renameChat(id, v);
    setRenamingId(null);
  };

  if (!chat) return null;
  const isRenaming = renamingId === chat.id;

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          "group relative flex w-full min-w-0 items-center gap-0.5 overflow-hidden rounded-md pr-1 transition-colors",
          isActiveChat && !selectedRunId
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60"
        )}
      >
        {isRenaming ? (
          <div className="flex w-full items-center gap-1 px-2 py-1.5">
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(chat.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="h-7 text-sm"
            />
            <button
              className="p-1 hover:text-foreground"
              onClick={() => commitRename(chat.id)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              className="p-1 hover:text-foreground"
              onClick={() => setRenamingId(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            {/* Expand/collapse chevron — only if there are runs. */}
            {chatRuns.length > 0 ? (
              <button
                className="flex h-6 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setManualToggle(!expanded);
                }}
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {/* Running indicator dot (pulsing) when this chat has active runs
                but the chat itself isn't selected. */}
            {hasActiveRun && !isActiveChat && (
              <span className="absolute left-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-pulse rounded-full bg-blue-400" />
            )}

            <button
              className="min-w-0 flex-1 truncate px-1 py-2 text-left text-sm"
              onClick={() => {
                selectChat(chat.id);
                selectRun(null);
              }}
              title={chat.title}
            >
              {chat.title}
            </button>
            {hasActiveRun && (
              <span className="mr-1 shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-blue-300">
                {activeRuns.length} live
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded p-1 text-muted-foreground opacity-60 transition hover:bg-sidebar-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
                    isActiveChat && "opacity-80"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenamingId(chat.id);
                    setRenameValue(chat.title);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete chat "${chat.title}"?`)) {
                      removeChat(chat.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {expanded && chatRuns.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {activeRuns.map((r) => (
            <RunRow
              key={r.id}
              run={r}
              depth={1}
              isActiveChat={isActiveChat}
            />
          ))}
          {/* Finished runs: collapsed subgroup, limited to N most recent. */}
          {finishedRuns.length > 0 && (
            <div
              className="space-y-0.5 pl-2"
              style={{ opacity: isActiveChat ? 1 : 0.7 }}
            >
              {finishedRuns.slice(0, MAX_FINISHED_RUNS).map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  depth={1}
                  isActiveChat={isActiveChat}
                />
              ))}
              {finishedRuns.length > MAX_FINISHED_RUNS && (
                <div className="px-3 py-0.5 text-[10px] text-muted-foreground">
                  + {finishedRuns.length - MAX_FINISHED_RUNS} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onOpenProviders }: { onOpenProviders: () => void }) {
  const chats = useChatsStore((s) => s.chats);
  const selectChat = useChatsStore((s) => s.selectChat);
  const overview = useAgentActivityStore((s) => s.overview);

  // Chats with active runs bubble to the top so live sub-agents are visible
  // even when many chats exist.
  const orderedChats = useMemo(() => {
    const activeChatIds = new Set(
      overview.filter((r) => r.status === "running").map((r) => r.chatId)
    );
    return [...chats].sort((a, b) => {
      const aActive = activeChatIds.has(a.id);
      const bActive = activeChatIds.has(b.id);
      if (aActive !== bActive) return aActive ? -1 : 1;
      // Within the same activity group, keep recent-first (chats already are).
      return b.updatedAt - a.updatedAt;
    });
  }, [chats, overview]);

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand — click to go home and start a new chat */}
      <button
        type="button"
        onClick={() => void selectChat(null)}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-left transition-colors hover:bg-sidebar-accent/60"
        title="New chat"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <MessageSquare className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">PowerUI</span>
      </button>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-full min-w-0 px-2 pb-2">
          {chats.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No chats yet.
            </div>
          )}
          <div className="space-y-0.5">
            {orderedChats.map((chat) => (
              <ChatNode key={chat.id} chatId={chat.id} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={onOpenProviders}
        >
          <Settings2 className="h-4 w-4" /> Providers &amp; models
        </Button>
      </div>
    </div>
  );
}
