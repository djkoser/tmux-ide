import type { SendBatch, SendRecipient } from "./api";

// After this many consecutive unreachable polls (~1s each) the poller gives up:
// the daemon bounced (e.g. the mission kill-switch) or the in-memory batch tracker
// lost the id, so the batch will never resolve and we must stop rather than spin.
export const MAX_POLL_MISSES = 10;

export interface PollDecision {
  /** Updated consecutive-miss count to carry into the next tick. */
  misses: number;
  /** Stop the interval. */
  stop: boolean;
  /** Recipients to render (present only when a batch was fetched). */
  recipients?: SendRecipient[];
  /** Stopped because the batch became unreachable — mark stuck recipients unknown. */
  gaveUp?: boolean;
}

/**
 * Decide the next poll action. A fetched batch resets the miss counter and stops
 * when done; a null fetch (404 / daemon unreachable) increments misses and stops
 * once they reach `maxMisses`, so the poll can never run forever.
 */
export function nextPollDecision(
  batch: SendBatch | null,
  misses: number,
  maxMisses: number = MAX_POLL_MISSES,
): PollDecision {
  if (!batch) {
    const next = misses + 1;
    return next >= maxMisses
      ? { misses: next, stop: true, gaveUp: true }
      : { misses: next, stop: false };
  }
  return { misses: 0, stop: batch.done, recipients: batch.recipients };
}

/** Mark any still-`retrying` recipient as `unknown` when the poll gives up. */
export function markPendingUnknown(recipients: SendRecipient[]): SendRecipient[] {
  return recipients.map((r) => (r.status === "retrying" ? { ...r, status: "unknown" } : r));
}
