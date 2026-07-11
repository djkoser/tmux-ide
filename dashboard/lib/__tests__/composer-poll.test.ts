import { describe, it, expect } from "vitest";
import { nextPollDecision, markPendingUnknown, MAX_POLL_MISSES } from "../composer-poll";
import type { SendBatch, SendRecipient } from "../api";

function batch(done: boolean, recipients: SendRecipient[] = []): SendBatch {
  return { batchId: "b", done, ok: true, recipients };
}

describe("nextPollDecision", () => {
  it("keeps polling while a batch is not done, resetting misses", () => {
    const d = nextPollDecision(batch(false), 4);
    expect(d.stop).toBe(false);
    expect(d.misses).toBe(0);
    expect(d.recipients).toBeDefined();
  });

  it("stops when the batch is done", () => {
    const d = nextPollDecision(batch(true), 0);
    expect(d.stop).toBe(true);
  });

  it("stops after N consecutive unreachable (null) fetches and flags giveUp", () => {
    let misses = 0;
    let last = nextPollDecision(null, misses);
    // Simulate the daemon gone: fetchSendBatch returns null every tick.
    for (let i = 1; i < MAX_POLL_MISSES; i++) {
      expect(last.stop).toBe(false);
      misses = last.misses;
      last = nextPollDecision(null, misses);
    }
    // The MAX_POLL_MISSES-th miss terminates the poll.
    expect(last.stop).toBe(true);
    expect(last.gaveUp).toBe(true);
    expect(last.misses).toBe(MAX_POLL_MISSES);
  });

  it("a successful fetch between misses resets the counter", () => {
    const afterMiss = nextPollDecision(null, 0);
    expect(afterMiss.misses).toBe(1);
    const afterHit = nextPollDecision(batch(false), afterMiss.misses);
    expect(afterHit.misses).toBe(0);
    expect(afterHit.stop).toBe(false);
  });
});

describe("markPendingUnknown", () => {
  it("flips only still-retrying recipients to unknown", () => {
    const recipients: SendRecipient[] = [
      {
        paneId: "%1",
        name: "cw1",
        title: "cw1",
        role: "teammate",
        status: "retrying",
        attempts: 2,
      },
      {
        paneId: "%2",
        name: "cw2",
        title: "cw2",
        role: "teammate",
        status: "delivered",
        attempts: 1,
      },
    ];
    const out = markPendingUnknown(recipients);
    expect(out.find((r) => r.paneId === "%1")!.status).toBe("unknown");
    expect(out.find((r) => r.paneId === "%2")!.status).toBe("delivered");
  });
});
