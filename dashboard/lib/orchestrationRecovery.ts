/**
 * Per-thread recovery coordinator — pure state machine ported from
 * t3code's apps/web/src/orchestrationRecovery.ts.
 *
 * Lifecycle:
 *
 *   ┌─ before bootstrap ──── classify → "defer" (queue for replay)
 *   │
 *   │  beginSnapshotRecovery("bootstrap") → fetch /api/threads/:id
 *   │  completeSnapshotRecovery(seq)      → bootstrapped = true
 *   │
 *   └─ steady state ──────── classify:
 *                              seq <= latest      → "ignore" (already applied)
 *                              seq === latest + 1 → "apply"
 *                              seq >  latest + 1  → "recover" (gap → replay)
 *
 * After a gap, the host calls `beginReplayRecovery`, fetches the missing
 * range (currently: re-snapshot via thread state), feeds events through
 * `markEventBatchApplied`, then `completeReplayRecovery`. The returned
 * `replayMadeProgress` + `shouldReplay` drive exponential-backoff retry
 * (`deriveReplayRetryDecision`) when replay didn't actually advance the
 * frontier (e.g. the daemon is still emitting a backlog).
 *
 * Scope note: the coordinator operates on a single thread's event log.
 * The host owns a `Map<threadId, Coordinator>` and routes each incoming
 * activity through the right one.
 */

export type OrchestrationRecoveryReason =
  | "bootstrap"
  | "sequence-gap"
  | "resubscribe"
  | "replay-failed";

export interface OrchestrationRecoveryPhase {
  kind: "snapshot" | "replay";
  reason: OrchestrationRecoveryReason;
}

export interface OrchestrationRecoveryState {
  latestSequence: number;
  highestObservedSequence: number;
  bootstrapped: boolean;
  pendingReplay: boolean;
  inFlight: OrchestrationRecoveryPhase | null;
}

export interface ReplayRecoveryCompletion {
  replayMadeProgress: boolean;
  shouldReplay: boolean;
}

export interface ReplayRetryTracker {
  attempts: number;
  latestSequence: number;
  highestObservedSequence: number;
}

export interface ReplayRetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  tracker: ReplayRetryTracker | null;
}

type SequencedEvent = Readonly<{ seq?: number; sequence?: number }>;

export type EventClassification = "ignore" | "defer" | "recover" | "apply";

/**
 * Exponential-backoff retry decision after a replay round. Mirrors t3's
 * helper verbatim — pure function, no closure over coordinator state.
 */
export function deriveReplayRetryDecision(input: {
  previousTracker: ReplayRetryTracker | null;
  completion: ReplayRecoveryCompletion;
  recoveryState: Pick<OrchestrationRecoveryState, "latestSequence" | "highestObservedSequence">;
  baseDelayMs: number;
  maxNoProgressRetries: number;
}): ReplayRetryDecision {
  if (!input.completion.shouldReplay) {
    return { shouldRetry: false, delayMs: 0, tracker: null };
  }
  if (input.completion.replayMadeProgress) {
    return { shouldRetry: true, delayMs: 0, tracker: null };
  }
  const prev = input.previousTracker;
  const sameFrontier =
    prev !== null &&
    prev.latestSequence === input.recoveryState.latestSequence &&
    prev.highestObservedSequence === input.recoveryState.highestObservedSequence;
  const attempts = sameFrontier && prev !== null ? prev.attempts + 1 : 1;
  if (attempts > input.maxNoProgressRetries) {
    return { shouldRetry: false, delayMs: 0, tracker: null };
  }
  return {
    shouldRetry: true,
    delayMs: input.baseDelayMs * 2 ** (attempts - 1),
    tracker: {
      attempts,
      latestSequence: input.recoveryState.latestSequence,
      highestObservedSequence: input.recoveryState.highestObservedSequence,
    },
  };
}

export interface OrchestrationRecoveryCoordinator {
  getState(): OrchestrationRecoveryState;
  classifyDomainEvent(sequence: number): EventClassification;
  markEventBatchApplied<T extends SequencedEvent>(events: ReadonlyArray<T>): ReadonlyArray<T>;
  beginSnapshotRecovery(reason: OrchestrationRecoveryReason): boolean;
  completeSnapshotRecovery(snapshotSequence: number): boolean;
  failSnapshotRecovery(): void;
  beginReplayRecovery(reason: OrchestrationRecoveryReason): boolean;
  completeReplayRecovery(): ReplayRecoveryCompletion;
  failReplayRecovery(): void;
}

export function createOrchestrationRecoveryCoordinator(): OrchestrationRecoveryCoordinator {
  let state: OrchestrationRecoveryState = {
    latestSequence: 0,
    highestObservedSequence: 0,
    bootstrapped: false,
    pendingReplay: false,
    inFlight: null,
  };
  let replayStartSequence: number | null = null;

  const snapshotState = (): OrchestrationRecoveryState => ({
    ...state,
    ...(state.inFlight ? { inFlight: { ...state.inFlight } } : {}),
  });

  const observeSequence = (sequence: number) => {
    state.highestObservedSequence = Math.max(state.highestObservedSequence, sequence);
  };

  const resolveReplayNeedAfterRecovery = () => {
    const pendingReplayBeforeReset = state.pendingReplay;
    const observedAhead = state.highestObservedSequence > state.latestSequence;
    const shouldReplay = pendingReplayBeforeReset || observedAhead;
    state.pendingReplay = false;
    return { shouldReplay, pendingReplayBeforeReset, observedAhead };
  };

  return {
    getState: snapshotState,

    classifyDomainEvent(sequence: number): EventClassification {
      observeSequence(sequence);
      if (sequence <= state.latestSequence) return "ignore";
      if (!state.bootstrapped || state.inFlight) {
        state.pendingReplay = true;
        return "defer";
      }
      if (sequence !== state.latestSequence + 1) {
        state.pendingReplay = true;
        return "recover";
      }
      return "apply";
    },

    markEventBatchApplied<T extends SequencedEvent>(events: ReadonlyArray<T>): ReadonlyArray<T> {
      const sequenceOf = (e: SequencedEvent): number => e.seq ?? e.sequence ?? 0;
      const next = events
        .filter((e) => sequenceOf(e) > state.latestSequence)
        .slice()
        .sort((a, b) => sequenceOf(a) - sequenceOf(b));
      if (next.length === 0) return [];
      const last = sequenceOf(next[next.length - 1]!);
      state.latestSequence = last;
      state.highestObservedSequence = Math.max(state.highestObservedSequence, last);
      return next;
    },

    beginSnapshotRecovery(reason: OrchestrationRecoveryReason): boolean {
      if (state.inFlight) {
        state.pendingReplay = true;
        return false;
      }
      state.inFlight = { kind: "snapshot", reason };
      return true;
    },

    completeSnapshotRecovery(snapshotSequence: number): boolean {
      state.latestSequence = Math.max(state.latestSequence, snapshotSequence);
      state.highestObservedSequence = Math.max(state.highestObservedSequence, state.latestSequence);
      state.bootstrapped = true;
      state.inFlight = null;
      return resolveReplayNeedAfterRecovery().shouldReplay;
    },

    failSnapshotRecovery(): void {
      state.inFlight = null;
    },

    beginReplayRecovery(reason: OrchestrationRecoveryReason): boolean {
      if (!state.bootstrapped || state.inFlight) {
        state.pendingReplay = true;
        return false;
      }
      state.pendingReplay = false;
      replayStartSequence = state.latestSequence;
      state.inFlight = { kind: "replay", reason };
      return true;
    },

    completeReplayRecovery(): ReplayRecoveryCompletion {
      const replayMadeProgress =
        replayStartSequence !== null && state.latestSequence > replayStartSequence;
      replayStartSequence = null;
      state.inFlight = null;
      const replayResolution = resolveReplayNeedAfterRecovery();
      return { replayMadeProgress, shouldReplay: replayResolution.shouldReplay };
    },

    failReplayRecovery(): void {
      replayStartSequence = null;
      state.bootstrapped = false;
      state.inFlight = null;
    },
  };
}

/**
 * Multi-thread coordinator registry — lazily allocates a coordinator per
 * threadId. The chat-v2 WS bridge owns one of these instances and routes
 * each incoming event through `forThread(threadId)` before applying it
 * to the store.
 */
export class OrchestrationRecoveryRegistry {
  private readonly coordinators = new Map<string, OrchestrationRecoveryCoordinator>();

  forThread(threadId: string): OrchestrationRecoveryCoordinator {
    let coord = this.coordinators.get(threadId);
    if (!coord) {
      coord = createOrchestrationRecoveryCoordinator();
      this.coordinators.set(threadId, coord);
    }
    return coord;
  }

  /** Drop the coordinator for a thread (e.g. on thread delete). */
  release(threadId: string): void {
    this.coordinators.delete(threadId);
  }

  /** Reset everything (testing). */
  reset(): void {
    this.coordinators.clear();
  }
}
