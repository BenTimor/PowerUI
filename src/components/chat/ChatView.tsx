import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, PanelRightClose, PanelRightOpen, Square } from "lucide-react";

import { useChatsStore } from "@/stores/chatsStore";
import { useProvidersStore } from "@/stores/providersStore";
import { useManagerStore } from "@/stores/managerStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "./ModelSelector";
import { MessageBubble } from "./MessageBubble";
import { HomeView } from "./HomeView";

export function ChatView({
  onOpenProviders,
  workspaceOpen,
  onToggleWorkspace,
}: {
  onOpenProviders: () => void;
  workspaceOpen: boolean;
  onToggleWorkspace: () => void;
}) {
  const messages = useChatsStore((s) => s.messages);
  const error = useChatsStore((s) => s.error);
  const currentChatId = useChatsStore((s) => s.currentChatId);
  const chats = useChatsStore((s) => s.chats);
  const setChatModel = useChatsStore((s) => s.setChatModel);

  const managerRunning = useManagerStore((s) => s.running);
  const send = useManagerStore((s) => s.send);
  const stop = useManagerStore((s) => s.stop);

  const providers = useProvidersStore((s) => s.providers);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = chats.find((c) => c.id === currentChatId);
  const hasModel = !!chat?.providerId && !!chat?.modelId;

  // Auto-scroll to bottom on new content.
  const streamingMessageId = useChatsStore(
    (s) => (managerRunning ? s.messages[s.messages.length - 1]?.id : null)
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, managerRunning]);

  // No chat selected → show the home page instead of an auto-created chat.
  if (!currentChatId) {
    return <HomeView onOpenProviders={onOpenProviders} />;
  }

  const handleSend = () => {
    if (!input.trim() || managerRunning) return;
    const text = input;
    setInput("");
    void send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const needsProvider = providers.length === 0;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <ModelSelector
          onOpenProviders={onOpenProviders}
          providerId={chat?.providerId ?? null}
          modelId={chat?.modelId ?? null}
          onSelect={(pid, mid) => {
            if (chat) void setChatModel(chat.id, pid, mid);
          }}
        />
        {chat?.modelId && (
          <span className="ml-auto truncate text-xs text-muted-foreground">
            {chat.title}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-8 w-8"
          onClick={onToggleWorkspace}
          title={workspaceOpen ? "Hide workspace" : "Show workspace"}
        >
          {workspaceOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Messages */}
      {needsProvider ? (
        <EmptyState onOpenProviders={onOpenProviders} variant="no-provider" />
      ) : messages.length === 0 ? (
        <EmptyState onOpenProviders={onOpenProviders} variant="empty" />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl py-2">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                streaming={m.id === streamingMessageId}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {managerRunning && (
        <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Manager is working…</span>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-xl border bg-background focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasModel
                  ? "Message the manager…  (Enter to send, Shift+Enter for newline)"
                  : "Select a model above first…"
              }
              rows={1}
              className="max-h-48 min-h-[52px] resize-none border-0 bg-transparent pr-11 shadow-none focus-visible:ring-0"
            />
            <div className="absolute bottom-2 right-2">
              {managerRunning ? (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  onClick={stop}
                  title="Stop"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-8 w-8"
                  disabled={!input.trim() || !hasModel}
                  onClick={handleSend}
                >
                  {managerRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            The manager can create tasks, assign sub-agents, and answer their
            questions. Verify outputs before use.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  variant,
  onOpenProviders,
}: {
  variant: "empty" | "no-provider";
  onOpenProviders: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Loader2 className="h-5 w-5 opacity-60" />
      </div>
      <h2 className="text-lg font-semibold">
        {variant === "no-provider"
          ? "Connect a provider to start"
          : "Start a conversation"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {variant === "no-provider"
          ? "Add an OpenAI-compatible provider (Ollama, OpenRouter, Groq, OpenAI, …) and pick a model to begin chatting."
          : "Pick a model above and type your message below. Responses will stream in."}
      </p>
      {variant === "no-provider" && (
        <Button className="mt-4" onClick={onOpenProviders}>
          Configure providers
        </Button>
      )}
    </div>
  );
}
