import { useEffect, useState } from "react";
import {
  Check,
  MessageSquare,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import { useChatsStore } from "@/stores/chatsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function Sidebar({
  onOpenProviders,
}: {
  onOpenProviders: () => void;
}) {
  const chats = useChatsStore((s) => s.chats);
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const selectChat = useChatsStore((s) => s.selectChat);
  const newChat = useChatsStore((s) => s.newChat);
  const removeChat = useChatsStore((s) => s.removeChat);
  const renameChat = useChatsStore((s) => s.renameChat);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    newChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitRename = async (id: string) => {
    const v = renameValue.trim();
    if (v) await renameChat(id, v);
    setRenamingId(null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <MessageSquare className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">PowerUI</span>
      </div>

      <div className="px-3">
        <Button
          onClick={() => newChat()}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>

      <ScrollArea className="mt-2 flex-1">
        <div className="px-2 pb-2">
          {chats.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No chats yet.
            </div>
          )}
          {chats.map((chat) => {
            const active = chat.id === currentChatId;
            const isRenaming = renamingId === chat.id;
            return (
              <div
                key={chat.id}
                className={cn(
                  "group relative flex items-center rounded-md transition-colors",
                  active
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
                      <Check className="h-3.5 w-3.5" />
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
                    <button
                      className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
                      onClick={() => selectChat(chat.id)}
                      title={chat.title}
                    >
                      {chat.title}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            "mr-1 rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-sidebar-accent data-[state=open]:opacity-100",
                            active && "opacity-60"
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
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={onOpenProviders}
        >
          <Settings2 className="h-4 w-4" /> Providers & models
        </Button>
      </div>
    </div>
  );
}
