import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import type { Task, TaskStatus } from "@/types";
import { useChatsStore } from "@/stores/chatsStore";
import { useTasksStore } from "@/stores/tasksStore";
import { useSubAgentsStore } from "@/stores/subAgentsStore";
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

const STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "cancelled",
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/** A small colored dot + label for the current status. */
function statusDotClass(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "bg-muted-foreground/50";
    case "in_progress":
      return "bg-blue-400";
    case "done":
      return "bg-emerald-400";
    case "cancelled":
      return "bg-red-400";
  }
}

function statusTriggerClass(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "border-border bg-muted/40 text-muted-foreground";
    case "in_progress":
      return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    case "done":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "cancelled":
      return "border-red-500/30 bg-red-500/10 text-red-300";
  }
}

export function TasksPanel() {
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const tasks = useTasksStore((s) => s.tasks);
  const loading = useTasksStore((s) => s.loading);
  const addTask = useTasksStore((s) => s.addTask);
  const editTask = useTasksStore((s) => s.editTask);
  const setStatus = useTasksStore((s) => s.setStatus);
  const removeTask = useTasksStore((s) => s.removeTask);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);

  if (!currentChatId) return null;

  const submitAdd = async () => {
    const t = title.trim();
    if (!t) return;
    await addTask({
      chatId: currentChatId,
      title: t,
      description: description.trim() || undefined,
      createdBy: "user",
    });
    setTitle("");
    setDescription("");
    setShowDesc(false);
    setAdding(false);
  };

  // Group: active first (todo/in_progress), then done/cancelled.
  const active = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  );
  const closed = tasks.filter(
    (t) => t.status === "done" || t.status === "cancelled"
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tasks
          {tasks.length > 0 && (
            <span className="ml-1.5 text-muted-foreground/70">
              {tasks.length}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setAdding((v) => !v)}
          title="Add task"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="shrink-0 border-b border-sidebar-border p-3">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitAdd();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setTitle("");
                setDescription("");
                setShowDesc(false);
              }
            }}
            placeholder="Task title…"
            className="h-8 text-sm"
          />
          {showDesc && (
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)…"
              className="mt-2 h-8 text-sm"
            />
          )}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDesc((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showDesc ? "Hide description" : "+ Description"}
            </button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setTitle("");
                  setDescription("");
                  setShowDesc(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={!title.trim()} onClick={() => void submitAdd()}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {tasks.length === 0 && !loading && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No tasks yet.
            </p>
          )}

          {active.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {active.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onStatusChange={(s) => void setStatus(task.id, s)}
                  onRename={(title) => void editTask(task.id, { title })}
                  onRemove={() => void removeTask(task.id)}
                />
              ))}
            </div>
          )}

          {closed.length > 0 && (
            <div className="mt-2">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                Completed
              </div>
              <div className="flex flex-col gap-1.5">
                {closed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onStatusChange={(s) => void setStatus(task.id, s)}
                    onRename={(title) => void editTask(task.id, { title })}
                    onRemove={() => void removeTask(task.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function useAssigneeName(assigneeId: string | null): string | null {
  return useSubAgentsStore((s) => {
    if (!assigneeId) return null;
    const a = s.subAgents.find((x) => x.id === assigneeId);
    return a?.name ?? assigneeId.slice(0, 8);
  });
}

function TaskRow({
  task,
  onStatusChange,
  onRename,
  onRemove,
}: {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const assignee = useAssigneeName(task.assigneeId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const commitRename = () => {
    const v = draft.trim();
    if (v && v !== task.title) onRename(v);
    setEditing(false);
  };

  const done = task.status === "done";
  const cancelled = task.status === "cancelled";

  return (
    <div className="group flex flex-col rounded-md border border-border bg-card px-2.5 py-2">
      {/* Row 1: status (left) + hover actions (right) */}
      <div className="flex items-center justify-between gap-2">
        <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
          <SelectTrigger
            className={cn(
              "h-6 w-auto shrink-0 gap-1.5 rounded-full border px-2 text-[11px] font-medium",
              statusTriggerClass(task.status)
            )}
            title="Change status"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(task.status))} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(s))} />
                  {STATUS_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
          {!editing && !done && !cancelled && (
            <button
              type="button"
              onClick={() => {
                setDraft(task.title);
                setEditing(true);
              }}
              title="Rename"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            title="Remove task"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Row 2: title (+ inline rename) */}
      <div className="min-w-0 pt-1.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-6 text-sm"
            />
            <button
              className="p-0.5 hover:text-foreground"
              onClick={commitRename}
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              className="p-0.5 hover:text-foreground"
              onClick={() => setEditing(false)}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div
            className="cursor-text text-sm leading-snug"
            onClick={() => {
              if (!done && !cancelled) {
                setDraft(task.title);
                setEditing(true);
              }
            }}
            title={done || cancelled ? task.title : "Click to rename"}
          >
            <span
              className={cn(
                "break-words",
                done && "text-muted-foreground line-through",
                cancelled && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </span>
          </div>
        )}

        {/* Row 3: assignee + description */}
        {(task.description || assignee) && (
          <div className="mt-1 flex flex-col gap-1">
            {task.assigneeId && assignee && (
              <div>
                <span
                  className={cn(
                    "rounded bg-muted/60 px-1 py-0.5 text-[10px] text-muted-foreground",
                    task.status === "in_progress" && "bg-blue-500/10 text-blue-300"
                  )}
                  title={task.assigneeId}
                >
                  → {assignee}
                </span>
              </div>
            )}
            {task.description && (
              <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground/80">
                {task.description}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
