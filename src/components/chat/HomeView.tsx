import { useEffect, useMemo, useState } from "react";
import { ArrowUp, MessageSquare, Sparkles } from "lucide-react";

import { useChatsStore } from "@/stores/chatsStore";
import { useProvidersStore } from "@/stores/providersStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "./ModelSelector";

/**
 * Shown when no chat is selected. Replaces the old behaviour of auto-creating
 * an empty chat on app open. Chats are only created here by an explicit user
 * action: clicking "New chat" or submitting the quick-send box.
 */
export function HomeView({
  onOpenProviders,
}: {
  onOpenProviders: () => void;
}) {
  const chats = useChatsStore((s) => s.chats);
  const newChat = useChatsStore((s) => s.newChat);
  const sendMessage = useChatsStore((s) => s.sendMessage);
  const selectChat = useChatsStore((s) => s.selectChat);
  const isStreaming = useChatsStore((s) => s.isStreaming);

  const providers = useProvidersStore((s) => s.providers);
  const modelsByProvider = useProvidersStore((s) => s.modelsByProvider);

  const [input, setInput] = useState("");

  // Pending provider/model selection for the next chat created from here.
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const hasProvider = providers.length > 0;
  const recent = chats.slice(0, 6);

  // Default to the first available provider's first model so the user can
  // start typing immediately.
  const defaultModel = useMemo(() => {
    if (providers.length === 0) return null;
    const p = providers[0];
    const models = modelsByProvider[p.id] ?? [];
    return { providerId: p.id, modelId: models[0]?.modelId ?? null };
  }, [providers, modelsByProvider]);

  useEffect(() => {
    if (!providerId && defaultModel) {
      setProviderId(defaultModel.providerId);
      setModelId(defaultModel.modelId);
    }
  }, [defaultModel, providerId]);

  const handleStart = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (!providerId || !modelId) return;
    setInput("");
    // Create a chat on demand (user-initiated) with the chosen provider/model,
    // then send the first message.
    await newChat(providerId, modelId);
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleStart();
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl">
          {/* Hero */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome to PowerUI
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create a new chat or explore your current ones. Pick a model,
              type a message, and responses stream right in.
            </p>
          </div>

          {hasProvider ? (
            <>
              {/* Quick-send: creates a chat on submit (user-initiated) */}
              <div className="relative rounded-xl border bg-background focus-within:ring-1 focus-within:ring-ring">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything to start a new chat…"
                  rows={1}
                  className="min-h-[52px] resize-none border-0 bg-transparent pr-11 shadow-none focus-visible:ring-0"
                />
                <div className="absolute bottom-2 right-2">
                  <Button
                    size="icon"
                    className="h-8 w-8"
                    disabled={!input.trim() || isStreaming || !modelId}
                    onClick={() => void handleStart()}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex justify-center">
                <ModelSelector
                  providerId={providerId}
                  modelId={modelId}
                  onSelect={(pid, mid) => {
                    setProviderId(pid);
                    setModelId(mid);
                  }}
                  onOpenProviders={onOpenProviders}
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Press Enter to send · Shift+Enter for a new line
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Connect an OpenAI-compatible provider (Ollama, OpenRouter,
                Groq, OpenAI, …) to start chatting.
              </p>
              <Button className="mt-4" onClick={onOpenProviders}>
                Configure providers
              </Button>
            </div>
          )}

          {/* Recent chats */}
          {recent.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent chats
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {recent.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => void selectChat(chat.id)}
                    className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {chat.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
