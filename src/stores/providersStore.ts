import { create } from "zustand";

import type { ModelEntry, Provider, ProviderModel } from "@/types";
import * as db from "@/lib/db";
import { listRemoteModels } from "@/lib/api/openai";

interface ProvidersState {
  providers: Provider[];
  exaApiKey: string | null;
  /** Models keyed by provider id. */
  modelsByProvider: Record<string, ModelEntry[]>;
  loading: boolean;
  refreshing: Record<string, boolean>;

  load: () => Promise<void>;
  addProvider: (input: {
    name: string;
    baseUrl: string;
    apiKey?: string | null;
  }) => Promise<Provider>;
  updateProvider: (
    id: string,
    input: Partial<Pick<Provider, "name" | "baseUrl" | "apiKey">>
  ) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  refreshModels: (providerId: string) => Promise<void>;
  loadModelsFor: (providerId: string) => Promise<void>;
  /** Flat list of {provider, model} pairs for selectors. */
  allProviderModels: () => ProviderModel[];
  getProvider: (id: string | null) => Provider | undefined;
  toggleModelStar: (modelDbId: number) => Promise<void>;
  setDefaultModel: (providerId: string, modelId: string) => Promise<void>;
  getDefaultModel: () => { providerId: string; modelId: string } | null;
  setExaApiKey: (apiKey: string | null) => Promise<void>;
}

export const EXA_API_KEY_SETTING = "exa_api_key";

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  exaApiKey: null,
  modelsByProvider: {},
  loading: false,
  refreshing: {},

  load: async () => {
    set({ loading: true });
    try {
      const providers = await db.listProviders();
      const exaApiKey = await db.getAppSetting(EXA_API_KEY_SETTING);
      const modelsByProvider: Record<string, ModelEntry[]> = {};
      for (const p of providers) {
        modelsByProvider[p.id] = await db.listModels(p.id);
      }
      set({ providers, modelsByProvider, exaApiKey });
    } finally {
      set({ loading: false });
    }
  },

  addProvider: async (input) => {
    const provider = await db.createProvider(input);
    set((s) => ({
      providers: [...s.providers, provider],
      modelsByProvider: { ...s.modelsByProvider, [provider.id]: [] },
    }));
    return provider;
  },

  updateProvider: async (id, input) => {
    await db.updateProvider(id, input);
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id
          ? {
              ...p,
              ...input,
              updatedAt: Date.now(),
            }
          : p
      ),
    }));
  },

  removeProvider: async (id) => {
    await db.deleteProvider(id);
    set((s) => {
      const modelsByProvider = { ...s.modelsByProvider };
      delete modelsByProvider[id];
      return {
        providers: s.providers.filter((p) => p.id !== id),
        modelsByProvider,
      };
    });
  },

  refreshModels: async (providerId) => {
    const provider = get().providers.find((p) => p.id === providerId);
    if (!provider) return;
    set((s) => ({
      refreshing: { ...s.refreshing, [providerId]: true },
    }));
    try {
      const remote = await listRemoteModels(
        provider.baseUrl,
        provider.apiKey
      );
      const models = remote.map((m) => ({
        modelId: m.id,
        label: m.label ?? null,
      }));
      await db.replaceModels(providerId, models);
      const cached = await db.listModels(providerId);
      set((s) => ({
        modelsByProvider: { ...s.modelsByProvider, [providerId]: cached },
      }));
    } finally {
      set((s) => ({
        refreshing: { ...s.refreshing, [providerId]: false },
      }));
    }
  },

  loadModelsFor: async (providerId) => {
    const cached = await db.listModels(providerId);
    set((s) => ({
      modelsByProvider: { ...s.modelsByProvider, [providerId]: cached },
    }));
  },

  allProviderModels: () => {
    const { providers, modelsByProvider } = get();
    const out: ProviderModel[] = [];
    for (const p of providers) {
      const models = modelsByProvider[p.id] ?? [];
      if (models.length === 0) {
        out.push({
          providerId: p.id,
          providerName: p.name,
          modelId: "(custom)",
          label: "Custom model…",
        });
      }
      for (const m of models) {
        out.push({
          providerId: p.id,
          providerName: p.name,
          modelId: m.modelId,
          label: m.label || m.modelId,
        });
      }
    }
    return out;
  },

  getProvider: (id) => {
    if (!id) return undefined;
    return get().providers.find((p) => p.id === id);
  },

  toggleModelStar: async (modelDbId) => {
    await db.toggleModelStar(modelDbId);
    // Refresh all providers' models to reflect the change.
    const { providers } = get();
    const modelsByProvider: Record<string, ModelEntry[]> = {};
    for (const p of providers) {
      modelsByProvider[p.id] = await db.listModels(p.id);
    }
    set({ modelsByProvider });
  },

  setDefaultModel: async (providerId, modelId) => {
    await db.setDefaultModel(providerId, modelId);
    // Refresh all providers' models to reflect the default change.
    const { providers } = get();
    const modelsByProvider: Record<string, ModelEntry[]> = {};
    for (const p of providers) {
      modelsByProvider[p.id] = await db.listModels(p.id);
    }
    set({ modelsByProvider });
  },

  getDefaultModel: () => {
    const { modelsByProvider } = get();
    for (const pid of Object.keys(modelsByProvider)) {
      const found = modelsByProvider[pid].find((m) => m.isDefault);
      if (found) {
        return { providerId: found.providerId, modelId: found.modelId };
      }
    }
    return null;
  },

  setExaApiKey: async (apiKey) => {
    const normalized = apiKey?.trim() || null;
    await db.setAppSetting(EXA_API_KEY_SETTING, normalized);
    set({ exaApiKey: normalized });
  },
}));
