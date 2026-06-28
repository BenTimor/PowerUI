import type { AgentEvent } from "@/types";

type Handler = (e: AgentEvent) => void;

interface AgentBus {
  /** Subscribe to events for a chat. Returns unsubscribe. */
  on(chatId: string, handler: Handler): () => void;
  /** Subscribe to ALL events regardless of chat. Returns unsubscribe.
   *  Used by the activity store to refresh the sidebar overview / trace view
   *  when a sub-agent emits, even if that chat isn't the active one. */
  onAll(handler: Handler): () => void;
  /** Notify subscribers that an event was created (call AFTER persisting to db). */
  emit(event: AgentEvent): void;
  /** Register a resolver for a pending blocking question. */
  registerPending(pendingEventId: string, resolve: (answer: string) => void): void;
  /** Deliver a manager answer to a blocking question (no-op if none). */
  deliverAnswer(pendingEventId: string, answer: string): void;
}

const handlersByChat = new Map<string, Set<Handler>>();
const globalHandlers = new Set<Handler>();
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

  onAll(handler) {
    globalHandlers.add(handler);
    return () => {
      globalHandlers.delete(handler);
    };
  },

  emit(event) {
    // Global handlers first (e.g. sidebar overview refresh).
    for (const handler of globalHandlers) {
      try {
        handler(event);
      } catch {
        // A subscriber throwing must not break other subscribers.
      }
    }
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
