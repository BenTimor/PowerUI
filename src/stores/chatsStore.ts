import { create } from "zustand";

import type { Chat, Message } from "@/types";
import * as db from "@/lib/db";
import { streamChatCompletion, type ChatCompletionMessage } from "@/lib/api/openai";
import { useProvidersStore } from "./providersStore";

interface ChatsState {
  chats: Chat[];
  currentChatId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: string | null;

  loadChats: () => Promise<void>;
  selectChat: (id: string | null) => Promise<void>;
  newChat: (
    selProviderId?: string | null,
    selModelId?: string | null
  ) => Promise<string>;
  renameChat: (id: string, title: string) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
  setChatModel: (
    chatId: string,
    providerId: string,
    modelId: string
  ) => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => void;
}

let abortController: AbortController | null = null;

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= 40) return clean;
  return clean.slice(0, 40).trimEnd() + "…";
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  currentChatId: null,
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  error: null,

  loadChats: async () => {
    const chats = await db.listChats();
    set({ chats });
  },

  selectChat: async (id) => {
    set({ currentChatId: id, error: null });
    if (id) {
      await get().loadMessages(id);
    } else {
      set({ messages: [] });
    }
  },

  newChat: async (selProviderId, selModelId) => {
    const chat = await db.createChat("New chat");
    set((s) => ({
      chats: [chat, ...s.chats],
      currentChatId: chat.id,
      messages: [],
      error: null,
    }));
    // Resolve provider/model: explicit selection wins, otherwise fall back
    // to the first available provider's first model.
    const providers = useProvidersStore.getState().providers;
    let providerId = selProviderId ?? null;
    let modelId = selModelId ?? null;
    if ((!providerId || !modelId) && providers.length > 0) {
      const p =
        providers.find((pp) => pp.id === providerId) ?? providers[0];
      const models =
        useProvidersStore.getState().modelsByProvider[p.id] ?? [];
      if (!providerId) providerId = p.id;
      if (!modelId) modelId = models[0]?.modelId ?? null;
    }
    if (providerId && modelId) {
      await db.updateChat(chat.id, { providerId, modelId });
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === chat.id
            ? { ...c, providerId, modelId }
            : c
        ),
      }));
    }
    return chat.id;
  },

  renameChat: async (id, title) => {
    await db.updateChat(id, { title });
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  removeChat: async (id) => {
    await db.deleteChat(id);
    set((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      const isCurrent = s.currentChatId === id;
      return {
        chats,
        currentChatId: isCurrent ? null : s.currentChatId,
        messages: isCurrent ? [] : s.messages,
      };
    });
  },

  setChatModel: async (chatId, providerId, modelId) => {
    await db.updateChat(chatId, { providerId, modelId });
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, providerId, modelId } : c
      ),
    }));
  },

  loadMessages: async (chatId) => {
    const messages = await db.listMessages(chatId);
    set({ messages });
  },

  sendMessage: async (text) => {
    const { currentChatId, messages, isStreaming } = get();
    if (!currentChatId || isStreaming) return;
    const content = text.trim();
    if (!content) return;

    const chat = get().chats.find((c) => c.id === currentChatId);
    if (!chat) return;
    if (!chat.providerId || !chat.modelId) {
      set({
        error: "Please select a provider and model for this chat first.",
      });
      return;
    }

    const provider = useProvidersStore
      .getState()
      .getProvider(chat.providerId);
    if (!provider) {
      set({ error: "The provider for this chat no longer exists." });
      return;
    }

    set({ error: null });

    // 1. Persist the user message.
    const userMsg = await db.insertMessage({
      chatId: currentChatId,
      role: "user",
      content,
    });

    // Auto-title on first user message.
    const isFirst = messages.length === 0;
    let title = chat.title;
    if (isFirst || chat.title === "New chat") {
      title = deriveTitle(content);
      await db.updateChat(currentChatId, { title });
    }
    await db.touchChat(currentChatId);

    set((s) => ({
      messages: [...s.messages, userMsg],
      chats: s.chats.map((c) =>
        c.id === currentChatId ? { ...c, title, updatedAt: Date.now() } : c
      ),
    }));

    // 2. Create an assistant placeholder.
    const assistantMsg = await db.insertMessage({
      chatId: currentChatId,
      role: "assistant",
      content: "",
    });
    set((s) => ({
      messages: [...s.messages, assistantMsg],
      isStreaming: true,
      streamingMessageId: assistantMsg.id,
    }));

    // 3. Build the message history for the API.
    const history: ChatCompletionMessage[] = [...messages, userMsg].map(
      (m) => ({ role: m.role, content: m.content })
    );

    abortController = new AbortController();
    let assembled = "";
    try {
      assembled = await streamChatCompletion({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: chat.modelId!,
        messages: history,
        callbacks: {
          signal: abortController.signal,
          onDelta: (delta) => {
            assembled += delta;
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + delta }
                  : m
              ),
            }));
          },
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown streaming error";
      // If aborted, keep whatever was streamed; otherwise surface error.
      if (err instanceof DOMException && err.name === "AbortError") {
        // user stopped — keep partial content
      } else {
        set({ error: message });
      }
    } finally {
      // Persist final assistant content.
      const finalContent = assembled || get().messages.find((m) => m.id === assistantMsg.id)?.content || "";
      await db.updateMessageContent(assistantMsg.id, finalContent);
      await db.touchChat(currentChatId);
      abortController = null;
      set((s) => ({
        isStreaming: false,
        streamingMessageId: null,
        chats: s.chats.map((c) =>
          c.id === currentChatId ? { ...c, updatedAt: Date.now() } : c
        ),
      }));
    }
  },

  stopStreaming: () => {
    if (abortController) {
      abortController.abort();
    }
  },
}));
