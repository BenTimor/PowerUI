import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Folder, FolderPlus, Trash2 } from "lucide-react";

import { useChatsStore } from "@/stores/chatsStore";
import { useChatFoldersStore } from "@/stores/chatFoldersStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Lists the folders attached to the current chat as agent working
 * directories. Folders are added via the native directory picker and removed
 * inline. Renders nothing when no chat is selected.
 */
export function FoldersPanel() {
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const folders = useChatFoldersStore((s) => s.folders);
  const addFolder = useChatFoldersStore((s) => s.addFolder);
  const removeFolder = useChatFoldersStore((s) => s.removeFolder);

  const [busy, setBusy] = useState(false);

  if (!currentChatId) return null;

  const handleAdd = async () => {
    if (busy || !currentChatId) return;
    setBusy(true);
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Add a working folder",
      });
      if (typeof picked === "string" && picked.length > 0) {
        await addFolder(currentChatId, picked);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Folders
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          disabled={busy}
          onClick={() => void handleAdd()}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add folder
        </Button>
      </div>

      <div className="border-t border-border" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {folders.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No folders attached.
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {folders.map((f) => (
              <li
                key={f.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5"
                )}
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {f.label && (
                    <div className="truncate text-xs font-medium">
                      {f.label}
                    </div>
                  )}
                  <div
                    className="truncate text-[11px] text-muted-foreground"
                    title={f.path}
                  >
                    {f.path}
                  </div>
                </div>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                  title="Remove folder"
                  onClick={() => void removeFolder(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </ScrollArea>
    </div>
  );
}
