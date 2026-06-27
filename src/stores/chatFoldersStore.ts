import { create } from "zustand";

import type { ChatFolder } from "@/types";
import * as db from "@/lib/db";
import { useChatsStore } from "@/stores/chatsStore";

interface ChatFoldersState {
  folders: ChatFolder[];
  loading: boolean;
  load(chatId: string): Promise<void>;
  clear(): void;
  addFolder(chatId: string, path: string, label?: string | null): Promise<void>;
  removeFolder(id: string): Promise<void>;
}

export const useChatFoldersStore = create<ChatFoldersState>((set, get) => ({
  folders: [],
  loading: false,

  load: async (chatId: string) => {
    set({ loading: true });
    try {
      const folders = await db.listChatFolders(chatId);
      set({ folders });
    } finally {
      set({ loading: false });
    }
  },

  clear: () => {
    set({ folders: [], loading: false });
  },

  addFolder: async (chatId, path, label) => {
    // Dedupe on path for this chat.
    if (get().folders.some((f) => f.path === path && f.chatId === chatId)) {
      return;
    }
    const folder = await db.addChatFolder({ chatId, path, label: label ?? null });
    set((s) => ({ folders: [...s.folders, folder] }));
  },

  removeFolder: async (id) => {
    await db.removeChatFolder(id);
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
  },
}));

/** Selector: the list of root paths for the runtime / file tools. */
export const selectFolderRoots = (s: ChatFoldersState) =>
  s.folders.map((f) => f.path);

// ---- Auto-load folders when the current chat changes. ----------------------
// Set up once at import time. When currentChatId becomes a truthy id, load its
// folders; when null, clear. Guards against re-loading the same chat.
let lastChatId: string | null = null;
useChatsStore.subscribe((state, prev) => {
  const id = state.currentChatId;
  if (prev.currentChatId === id) return;
  if (id) {
    if (id !== lastChatId) {
      lastChatId = id;
      void useChatFoldersStore.getState().load(id);
    }
  } else {
    lastChatId = null;
    useChatFoldersStore.getState().clear();
  }
});
