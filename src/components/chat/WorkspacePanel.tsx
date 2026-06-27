import { useState } from "react";
import { FolderTree, ListTodo, Bot, Activity } from "lucide-react";

import { FoldersPanel } from "./FoldersPanel";
import { TasksPanel } from "./TasksPanel";
import { SubAgentsPanel } from "./SubAgentsPanel";
import { ActivityPanel } from "./ActivityPanel";
import { cn } from "@/lib/utils";

type Tab = "folders" | "tasks" | "agents" | "activity";

const TABS: { id: Tab; label: string; icon: typeof FolderTree }[] = [
  { id: "folders", label: "Folders", icon: FolderTree },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "activity", label: "Activity", icon: Activity },
];

export function WorkspacePanel() {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div className="flex h-full w-full flex-col bg-sidebar/40">
      <div className="grid grid-cols-4 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "folders" && <FoldersPanel />}
        {tab === "tasks" && <TasksPanel />}
        {tab === "agents" && <SubAgentsPanel />}
        {tab === "activity" && <ActivityPanel />}
      </div>
    </div>
  );
}
