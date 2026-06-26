export type MessageRole = "user" | "assistant" | "system";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ModelEntry {
  id: number;
  providerId: string;
  modelId: string;
  label: string | null;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  providerId: string | null;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

/** A model paired with its provider for display/selection. */
export interface ProviderModel {
  providerId: string;
  providerName: string;
  modelId: string;
  label: string;
}
