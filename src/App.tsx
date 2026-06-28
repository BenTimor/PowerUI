import { useEffect, useState } from "react";

import { useProvidersStore } from "@/stores/providersStore";
import { useChatsStore } from "@/stores/chatsStore";
import { useAgentActivityStore } from "@/stores/agentActivityStore";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatView } from "@/components/chat/ChatView";
import { SubAgentTraceView } from "@/components/chat/SubAgentTraceView";
import { WorkspacePanel } from "@/components/chat/WorkspacePanel";
import { ProviderSettingsDialog } from "@/components/provider/ProviderSettingsDialog";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const [providersOpen, setProvidersOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const loadProviders = useProvidersStore((s) => s.load);
  const loadChats = useChatsStore((s) => s.loadChats);
  const loadOverview = useAgentActivityStore((s) => s.loadOverview);
  const selectedRunId = useAgentActivityStore((s) => s.selectedRunId);
  const selectRun = useAgentActivityStore((s) => s.selectRun);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    void loadProviders();
    void loadChats().then(() => {
      // After chats are available, populate the cross-chat runs overview so
      // the sidebar tree shows active/recent sub-agent runs immediately.
      void loadOverview();
    });
  }, [loadProviders, loadChats, loadOverview]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <aside className="w-64 shrink-0 border-r border-sidebar-border">
          <Sidebar onOpenProviders={() => setProvidersOpen(true)} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          {selectedRunId ? (
            <SubAgentTraceView onBack={() => selectRun(null)} />
          ) : (
            <ChatView
              onOpenProviders={() => setProvidersOpen(true)}
              workspaceOpen={workspaceOpen}
              onToggleWorkspace={() => setWorkspaceOpen((v) => !v)}
            />
          )}
        </main>
        {workspaceOpen && (
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-sidebar-border">
            <WorkspacePanel />
          </aside>
        )}
      </div>
      <ProviderSettingsDialog
        open={providersOpen}
        onOpenChange={setProvidersOpen}
      />
    </TooltipProvider>
  );
}
