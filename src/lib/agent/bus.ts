import type { AgentEvent } from "@/types";

type Handler = (e: AgentEvent) => void;

interface AgentBus {
  /** Subscribe to events for a chat. Returns unsubscribe. */
  on(chatId: string, handler: Handler): () => void;
  /** Notify subscribers that an event was created (call AFTER persisting to db). */
  emit(event: AgentEvent): void;
  /** Register a resolver for a pending blocking question. */
  registerPending(pendingEventId: string, resolve: (answer: string) => void): void;
  /** Deliver a manager answer to a blocking question (no-op if none). */
  deliverAnswer(pendingEventId: string, answer: string): void;
}

const handlersByChat = new Map<string, Set<Handler>>();
const pendingResolvers = new Map<
  string,
  (answer: string) => void
>();

export const agentBus: AgentBus = {
  on(chatId, handler) {
    let set = handlersByChat.get(chatId);
    if (!set) {
      set = new Set();
      handlersByChat.set(chatId, set);
    }
    set.add(handler);
    return () => {
      const s = handlersByChat.get(chatId);
      if (s) {
        s.delete(handler);
        if (s.size === 0) handlersByChat.delete(chatId);
      }
    };
  },

  emit(event) {
    const set = handlersByChat.get(event.chatId);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch {
        // A subscriber throwing must not break other subscribers.
      }
    }
  },

  registerPending(pendingEventId, resolve) {
    pendingResolvers.set(pendingEventId, resolve);
  },

  deliverAnswer(pendingEventId, answer) {
    const resolve = pendingResolvers.get(pendingEventId);
    if (!resolve) return;
    pendingResolvers.delete(pendingEventId);
    resolve(answer);
  },
};
