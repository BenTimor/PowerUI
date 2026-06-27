import { create } from "zustand";

import type { SubAgent } from "@/types";
import * as db from "@/lib/db";
import { useChatsStore } from "./chatsStore";
import { useProvidersStore } from "./providersStore";

interface ResolvedModel {
  providerId: string;
  providerName: string;
  providerBaseUrl: string;
  providerApiKey: string | null;
  modelId: string;
}

interface SubAgentsState {
  subAgents: SubAgent[];
  loading: boolean;
  load(chatId: string): Promise<void>;
  clear(): void;
  addSubAgent(input: {
    chatId: string;
    name: string;
    description?: string;
    providerId?: string | null;
    modelId?: string | null;
    systemPrompt?: string;
  }): Promise<SubAgent | null>;
  editSubAgent(
    id: string,
    patch: Partial<
      Pick<
        SubAgent,
        "name" | "description" | "providerId" | "modelId" | "systemPrompt"
      >
    >
  ): Promise<void>;
  removeSubAgent(id: string): Promise<void>;
  /** Resolve a sub-agent's effective provider+model, falling back to the
   *  chat's provider+model if the sub-agent has none. Returns null if no
   *  provider/model can be resolved. */
  resolveModel(subAgentId: string): ResolvedModel | null;
}

export const useSubAgentsStore = create<SubAgentsState>((set, get) => ({
  subAgents: [],
  loading: false,

  load: async (chatId) => {
    set({ loading: true });
    try {
      const subAgents = await db.listSubAgents(chatId);
      set({ subAgents });
    } finally {
      set({ loading: false });
    }
  },

  clear: () => set({ subAgents: [], loading: false }),

  addSubAgent: async (input) => {
    try {
      const created = await db.createSubAgent(input);
      set((s) => ({ subAgents: [...s.subAgents, created] }));
      return created;
    } catch (err) {
      console.error("subAgentsStore.addSubAgent failed", err);
      return null;
    }
  },

  editSubAgent: async (id, patch) => {
    await db.updateSubAgent(id, patch);
    set((s) => ({
      subAgents: s.subAgents.map((a) =>
        a.id === id
          ? {
              ...a,
              ...patch,
              updatedAt: Date.now(),
            }
          : a
      ),
    }));
  },

  removeSubAgent: async (id) => {
    await db.deleteSubAgent(id);
    set((s) => ({ subAgents: s.subAgents.filter((a) => a.id !== id) }));
  },

  resolveModel: (subAgentId) => {
    const subAgent = get().subAgents.find((a) => a.id === subAgentId);
    if (!subAgent) return null;

    // Fall back to the chat's provider/model when the sub-agent has none.
    const chat = useChatsStore
      .getState()
      .chats.find((c) => c.id === subAgent.chatId);
    const providerId = subAgent.providerId ?? chat?.providerId ?? null;
    const modelId = subAgent.modelId ?? chat?.modelId ?? null;
    if (!providerId || !modelId) return null;

    const providersState = useProvidersStore.getState();
    const provider =
      providersState.getProvider(providerId) ??
      providersState.providers.find((p) => p.id === providerId);
    if (!provider) return null;

    return {
      providerId: provider.id,
      providerName: provider.name,
      providerBaseUrl: provider.baseUrl,
      providerApiKey: provider.apiKey,
      modelId,
    };
  },
}));

// Auto-load sub-agents whenever the current chat changes. When a chat is
// selected, load its sub-agents; when deselected, clear the list.
useChatsStore.subscribe((state, prev) => {
  if (state.currentChatId === prev.currentChatId) return;
  if (state.currentChatId) {
    void useSubAgentsStore.getState().load(state.currentChatId);
  } else {
    useSubAgentsStore.getState().clear();
  }
});
