import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useSubAgentsStore } from "@/stores/subAgentsStore";
import { useChatsStore } from "@/stores/chatsStore";
import { useProvidersStore } from "@/stores/providersStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SubAgentEditor } from "./SubAgentEditor";
import type { SubAgent } from "@/types";

export function SubAgentsPanel() {
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const subAgents = useSubAgentsStore((s) => s.subAgents);
  const removeSubAgent = useSubAgentsStore((s) => s.removeSubAgent);
  const getProvider = useProvidersStore((s) => s.getProvider);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SubAgent | null>(null);

  if (!currentChatId) return null;

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (agent: SubAgent) => {
    setEditing(agent);
    setEditorOpen(true);
  };
  const handleDelete = (agent: SubAgent) => {
    if (confirm(`Delete sub-agent "${agent.name}"?`)) {
      void removeSubAgent(agent.id);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sub-Agents
          {subAgents.length > 0 && (
            <span className="ml-1.5 text-muted-foreground/70">
              {subAgents.length}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={openAdd}
          title="Add sub-agent"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {subAgents.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No sub-agents yet. Add one to delegate work.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {subAgents.map((agent) => {
                const provider =
                  agent.providerId != null
                    ? getProvider(agent.providerId)
                    : undefined;
                const hasOwnModel =
                  agent.providerId != null && agent.modelId != null;
                return (
                  <div
                    key={agent.id}
                    className="group rounded-md border border-border bg-card px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {agent.name}
                        </div>
                        {agent.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {agent.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEdit(agent)}
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-destructive"
                          onClick={() => handleDelete(agent)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      {hasOwnModel ? (
                        <Badge variant="secondary" className="font-normal">
                          {provider?.name ?? agent.providerId} /{" "}
                          {agent.modelId}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="font-normal text-muted-foreground"
                        >
                          inherits chat model
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <SubAgentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        chatId={currentChatId}
        subAgent={editing}
      />
    </div>
  );
}
