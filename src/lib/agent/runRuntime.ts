import type { LoopMessage } from "@/lib/api/openai";

/**
 * Non-serializable per-run runtime state (AbortControllers, mailboxes,
 * saved message lists) that lives OUTSIDE the Zustand store because it
 * contains functions / Promises and should never be React state.
 *
 * Keyed by runId. Entries are created when a run starts/resumes and removed
 * when the loop settles (completes/fails/is cancelled) so memory is bounded
 * to currently-running runs.
 */
export interface RunRuntime {
  /** AbortController for the active loop. Present while the loop is running. */
  controller: AbortController;
  /** Mailbox of messages to drain into the loop at the next turn. */
  mailbox: LoopMessage[];
  /** The working message list at the start of (or last saved during) the
   *  current loop invocation. Updated each turn so a mid-flight stop can
   *  still persist a resume point. Used by the bus emit path? No — kept
   *  here purely so a stop() can read it back for saveRunMessages. */
  messages: LoopMessage[];
  /** Loop turn index where the current invocation started. */
  startTurn: number;
  /** Bumped each time the messages array is persisted, so we can detect
   *  whether a save is needed on stop. */
  turn: number;
}

const runtimes = new Map<string, RunRuntime>();

export const runRuntime = {
  get(runId: string): RunRuntime | undefined {
    return runtimes.get(runId);
  },
  set(runId: string, rt: RunRuntime): void {
    runtimes.set(runId, rt);
  },
  delete(runId: string): void {
    runtimes.delete(runId);
  },
  /** Is a loop currently running for this runId? */
  isActive(runId: string): boolean {
    const rt = runtimes.get(runId);
    return !!rt && !rt.controller.signal.aborted;
  },
};
