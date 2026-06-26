import { useEffect, useState } from "react";

import { useProvidersStore } from "@/stores/providersStore";
import { useChatsStore } from "@/stores/chatsStore";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatView } from "@/components/chat/ChatView";
import { ProviderSettingsDialog } from "@/components/provider/ProviderSettingsDialog";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const [providersOpen, setProvidersOpen] = useState(false);

  const loadProviders = useProvidersStore((s) => s.load);
  const loadChats = useChatsStore((s) => s.loadChats);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    void loadProviders();
    void loadChats();
  }, [loadProviders, loadChats]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <aside className="w-64 shrink-0 border-r border-sidebar-border">
          <Sidebar onOpenProviders={() => setProvidersOpen(true)} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <ChatView onOpenProviders={() => setProvidersOpen(true)} />
        </main>
      </div>
      <ProviderSettingsDialog
        open={providersOpen}
        onOpenChange={setProvidersOpen}
      />
    </TooltipProvider>
  );
}
