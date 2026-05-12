import { describe, expect, it } from "vitest";
import {
  OrchestrationRecoveryRegistry,
  createOrchestrationRecoveryCoordinator,
  deriveReplayRetryDecision,
} from "../orchestrationRecovery";

describe("createOrchestrationRecoveryCoordinator — classify", () => {
  it("defers events that arrive before bootstrap completes", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    expect(coord.classifyDomainEvent(5)).toBe("defer");
    expect(coord.getState()).toMatchObject({
      bootstrapped: false,
      pendingReplay: true,
      highestObservedSequence: 5,
    });
  });

  it("applies the next sequential event after bootstrap", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.beginSnapshotRecovery("bootstrap");
    coord.completeSnapshotRecovery(10);
    expect(coord.classifyDomainEvent(11)).toBe("apply");
    coord.markEventBatchApplied([{ seq: 11 }]);
    expect(coord.getState().latestSequence).toBe(11);
  });

  it("ignores stale events that are at or behind the frontier", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.beginSnapshotRecovery("bootstrap");
    coord.completeSnapshotRecovery(20);
    expect(coord.classifyDomainEvent(15)).toBe("ignore");
    expect(coord.classifyDomainEvent(20)).toBe("ignore");
  });

  it("recovers (replay) when a gap is detected post-bootstrap", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.beginSnapshotRecovery("bootstrap");
    coord.completeSnapshotRecovery(10);
    expect(coord.classifyDomainEvent(13)).toBe("recover");
    expect(coord.getState().pendingReplay).toBe(true);
    expect(coord.getState().highestObservedSequence).toBe(13);
  });
});

describe("createOrchestrationRecoveryCoordinator — markEventBatchApplied", () => {
  it("returns only the events newer than the frontier and updates state", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.beginSnapshotRecovery("bootstrap");
    coord.completeSnapshotRecovery(5);
    const result = coord.markEventBatchApplied([{ seq: 3 }, { seq: 6 }, { seq: 7 }]);
    expect(result.map((e) => e.seq)).toEqual([6, 7]);
    expect(coord.getState().latestSequence).toBe(7);
  });

  it("accepts both `seq` and `sequence` keys for batch entries", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.beginSnapshotRecovery("bootstrap");
    coord.completeSnapshotRecovery(0);
    const result = coord.markEventBatchApplied([{ sequence: 2 }, { seq: 1 }]);
    expect(result).toHaveLength(2);
    expect(coord.getState().latestSequence).toBe(2);
  });
});

describe("createOrchestrationRecoveryCoordinator — snapshot/replay phases", () => {
  it("rejects concurrent snapshot recoveries and marks pending replay", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    expect(coord.beginSnapshotRecovery("bootstrap")).toBe(true);
    expect(coord.beginSnapshotRecovery("resubscribe")).toBe(false);
    expect(coord.getState().pendingReplay).toBe(true);
  });

  it("rejects replay before bootstrap and marks pending replay", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    expect(coord.beginReplayRecovery("sequence-gap")).toBe(false);
    expect(coord.getState().pendingReplay).toBe(true);
  });

  it("completeSnapshotRecovery returns true when a deferred replay is queued", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.classifyDomainEvent(7); // deferred, queues pending replay
    coord.beginSnapshotRecovery("bootstrap");
    const shouldReplay = coord.completeSnapshotRecovery(5);
    expect(shouldReplay).toBe(true);
  });

  it("completeReplayRecovery reports progress when frontier advanced", () => {
    const coord = createOrchestrationRecoveryCoordinator();
    coord.beginSnapshotRecovery("bootstrap");
    coord.completeSnapshotRecovery(5);
    coord.beginReplayRecovery("sequence-gap");
    coord.markEventBatchApplied([{ seq: 6 }, { seq: 7 }]);
    const completion = coord.completeReplayRecovery();
    expect(completion.replayMadeProgress).toBe(true);
  });
});

describe("deriveReplayRetryDecision", () => {
  it("does not retry when shouldReplay is false", () => {
    const decision = deriveReplayRetryDecision({
      previousTracker: null,
      completion: { replayMadeProgress: false, shouldReplay: false },
      recoveryState: { latestSequence: 0, highestObservedSequence: 0 },
      baseDelayMs: 100,
      maxNoProgressRetries: 5,
    });
    expect(decision.shouldRetry).toBe(false);
  });

  it("retries immediately when progress was made", () => {
    const decision = deriveReplayRetryDecision({
      previousTracker: null,
      completion: { replayMadeProgress: true, shouldReplay: true },
      recoveryState: { latestSequence: 5, highestObservedSequence: 7 },
      baseDelayMs: 100,
      maxNoProgressRetries: 5,
    });
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(0);
  });

  it("backs off exponentially when no progress is made", () => {
    const recoveryState = { latestSequence: 5, highestObservedSequence: 7 };
    const completion = { replayMadeProgress: false, shouldReplay: true };
    const first = deriveReplayRetryDecision({
      previousTracker: null,
      completion,
      recoveryState,
      baseDelayMs: 100,
      maxNoProgressRetries: 5,
    });
    expect(first.delayMs).toBe(100);
    const second = deriveReplayRetryDecision({
      previousTracker: first.tracker,
      completion,
      recoveryState,
      baseDelayMs: 100,
      maxNoProgressRetries: 5,
    });
    expect(second.delayMs).toBe(200);
    const third = deriveReplayRetryDecision({
      previousTracker: second.tracker,
      completion,
      recoveryState,
      baseDelayMs: 100,
      maxNoProgressRetries: 5,
    });
    expect(third.delayMs).toBe(400);
  });

  it("stops retrying after maxNoProgressRetries", () => {
    let tracker = null as null | { attempts: number; latestSequence: number; highestObservedSequence: number };
    const recoveryState = { latestSequence: 5, highestObservedSequence: 7 };
    const completion = { replayMadeProgress: false, shouldReplay: true };
    for (let i = 0; i < 3; i += 1) {
      const dec = deriveReplayRetryDecision({
        previousTracker: tracker,
        completion,
        recoveryState,
        baseDelayMs: 100,
        maxNoProgressRetries: 3,
      });
      tracker = dec.tracker;
    }
    const last = deriveReplayRetryDecision({
      previousTracker: tracker,
      completion,
      recoveryState,
      baseDelayMs: 100,
      maxNoProgressRetries: 3,
    });
    expect(last.shouldRetry).toBe(false);
  });
});

describe("OrchestrationRecoveryRegistry", () => {
  it("returns a stable coordinator per threadId", () => {
    const reg = new OrchestrationRecoveryRegistry();
    const a1 = reg.forThread("t-1");
    const a2 = reg.forThread("t-1");
    const b = reg.forThread("t-2");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("release drops a thread's coordinator so the next forThread is fresh", () => {
    const reg = new OrchestrationRecoveryRegistry();
    const a = reg.forThread("t-1");
    a.beginSnapshotRecovery("bootstrap");
    a.completeSnapshotRecovery(42);
    reg.release("t-1");
    const a2 = reg.forThread("t-1");
    expect(a2).not.toBe(a);
    expect(a2.getState().latestSequence).toBe(0);
  });
});
