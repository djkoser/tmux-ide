/**
 * T077 chat-v2 zustand store tests. Covers reducer correctness over
 * the full t3-style event union, derived state (unread tracking), and
 * basic thread CRUD.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetChatStoreForTests,
  useChatStore,
  type ActivityView,
  type CheckpointSummaryView,
  type ProposedPlanView,
} from "@/components/chat-v2/useChatStore";
import type {
  ChatActivityAppendedEvent,
  ChatCheckpointCreatedEvent,
  ChatPlanUpsertedEvent,
  ChatThreadRevertedEvent,
  ChatTurnAbortedEvent,
  ChatTurnCompletedEvent,
  ChatTurnStartedEvent,
  ThreadIndexEntry,
} from "@/components/chat/types";

const THREAD_A: ThreadIndexEntry = {
  id: "thr_a",
  title: "Alpha",
  createdAt: "2026-05-11T10:00:00Z",
  updatedAt: "2026-05-11T10:00:00Z",
  providerKind: "claude-code",
  messageCount: 0,
};

const THREAD_B: ThreadIndexEntry = {
  id: "thr_b",
  title: "Beta",
  createdAt: "2026-05-11T11:00:00Z",
  updatedAt: "2026-05-11T11:00:00Z",
  providerKind: "codex",
  messageCount: 0,
};

function activity(overrides: Partial<ActivityView> = {}): ActivityView {
  return {
    id: "evt_1",
    tone: "info",
    kind: "step",
    summary: "thinking",
    payload: null,
    turnId: "turn_1",
    sequence: 0,
    createdAt: "2026-05-11T10:00:00Z",
    ...overrides,
  };
}

function turnStarted(overrides: Partial<ChatTurnStartedEvent> = {}): ChatTurnStartedEvent {
  return {
    type: "chat.turn.started",
    threadId: "thr_a",
    turnId: "turn_1",
    requestedAt: "2026-05-11T10:00:00Z",
    ...overrides,
  };
}

function turnCompleted(
  overrides: Partial<ChatTurnCompletedEvent> = {},
): ChatTurnCompletedEvent {
  return {
    type: "chat.turn.completed",
    threadId: "thr_a",
    turnId: "turn_1",
    state: "completed",
    completedAt: "2026-05-11T10:01:00Z",
    ...overrides,
  };
}

function turnAborted(overrides: Partial<ChatTurnAbortedEvent> = {}): ChatTurnAbortedEvent {
  return {
    type: "chat.turn.aborted",
    threadId: "thr_a",
    turnId: "turn_1",
    reason: "cancelled",
    ...overrides,
  };
}

function activityAppended(
  overrides: Partial<ChatActivityAppendedEvent> = {},
): ChatActivityAppendedEvent {
  return {
    type: "chat.activity.appended",
    threadId: "thr_a",
    activity: activity(),
    seq: 0,
    ...overrides,
  };
}

function plan(overrides: Partial<ProposedPlanView> = {}): ProposedPlanView {
  return {
    id: "plan_1",
    turnId: "turn_1",
    planMarkdown: "## Plan",
    implementedAt: null,
    implementationThreadId: null,
    createdAt: "2026-05-11T10:00:00Z",
    updatedAt: "2026-05-11T10:00:00Z",
    ...overrides,
  };
}

function checkpoint(overrides: Partial<CheckpointSummaryView> = {}): CheckpointSummaryView {
  return {
    turnId: "turn_1",
    checkpointTurnCount: 1,
    checkpointRef: "deadbeef",
    status: "ready",
    files: [],
    assistantMessageId: null,
    completedAt: "2026-05-11T10:01:00Z",
    ...overrides,
  };
}

beforeEach(() => __resetChatStoreForTests());
afterEach(() => __resetChatStoreForTests());

describe("chat-v2 store: thread CRUD", () => {
  it("setThreads replaces the thread index", () => {
    useChatStore.getState().setThreads([THREAD_A, THREAD_B]);
    expect(useChatStore.getState().threads).toEqual([THREAD_A, THREAD_B]);
  });

  it("upsertThread prepends a new thread", () => {
    useChatStore.getState().setThreads([THREAD_B]);
    useChatStore.getState().upsertThread(THREAD_A);
    expect(useChatStore.getState().threads.map((t) => t.id)).toEqual(["thr_a", "thr_b"]);
  });

  it("upsertThread updates an existing thread in place", () => {
    useChatStore.getState().setThreads([THREAD_A, THREAD_B]);
    useChatStore.getState().upsertThread({ ...THREAD_A, title: "Alpha Renamed" });
    expect(useChatStore.getState().threads[0]?.title).toBe("Alpha Renamed");
  });

  it("removeThread drops the thread + its derived state + clears active", () => {
    useChatStore.getState().setThreads([THREAD_A, THREAD_B]);
    useChatStore.getState().setActiveThread("thr_a");
    useChatStore.getState().applyEvent(activityAppended());
    useChatStore.getState().removeThread("thr_a");
    const s = useChatStore.getState();
    expect(s.threads.map((t) => t.id)).toEqual(["thr_b"]);
    expect(s.activeThreadId).toBeNull();
    expect(s.activitiesByThread.thr_a).toBeUndefined();
  });

  it("setActiveThread marks the thread visited and clears its unread", () => {
    useChatStore.getState().setThreads([THREAD_A]);
    useChatStore.getState().applyEvent(activityAppended());
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(1);
    useChatStore.getState().setActiveThread("thr_a");
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(0);
  });
});

describe("chat-v2 store: activity-appended reducer", () => {
  it("appends to the per-thread activity bucket and tracks lastSeq", () => {
    useChatStore.getState().applyEvent(activityAppended({ seq: 3 }));
    expect(useChatStore.getState().activitiesByThread.thr_a).toHaveLength(1);
    expect(useChatStore.getState().lastSeqByThread.thr_a).toBe(3);
  });

  it("is idempotent over duplicate activity ids (replay safe)", () => {
    useChatStore.getState().applyEvent(activityAppended({ seq: 0 }));
    useChatStore.getState().applyEvent(activityAppended({ seq: 0 }));
    expect(useChatStore.getState().activitiesByThread.thr_a).toHaveLength(1);
  });

  it("increments unread on inactive thread", () => {
    useChatStore.getState().setActiveThread("thr_b");
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a" }));
    useChatStore.getState().applyEvent(
      activityAppended({ threadId: "thr_a", activity: activity({ id: "evt_2" }), seq: 1 }),
    );
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(2);
  });

  it("does not increment unread when the thread is active", () => {
    useChatStore.getState().setActiveThread("thr_a");
    useChatStore.getState().applyEvent(activityAppended());
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(0);
  });
});

describe("chat-v2 store: turn lifecycle reducers", () => {
  it("turn.started creates a running turn pinned by id", () => {
    useChatStore.getState().applyEvent(turnStarted());
    const turn = useChatStore.getState().turnsByThread.thr_a?.turn_1;
    expect(turn?.state).toBe("running");
    expect(turn?.completedAt).toBeNull();
  });

  it("turn.completed flips state to completed and records completedAt", () => {
    useChatStore.getState().applyEvent(turnStarted());
    useChatStore
      .getState()
      .applyEvent(turnCompleted({ assistantMessageId: "msg_2" }));
    const turn = useChatStore.getState().turnsByThread.thr_a?.turn_1;
    expect(turn?.state).toBe("completed");
    expect(turn?.completedAt).toBe("2026-05-11T10:01:00Z");
    expect(turn?.assistantMessageId).toBe("msg_2");
  });

  it("turn.aborted with reason=interrupted records the abort reason", () => {
    useChatStore.getState().applyEvent(turnStarted());
    useChatStore.getState().applyEvent(turnAborted({ reason: "interrupted" }));
    const turn = useChatStore.getState().turnsByThread.thr_a?.turn_1;
    expect(turn?.state).toBe("interrupted");
    expect(turn?.abortReason).toBe("interrupted");
  });

  it("turn.aborted with reason=error maps to state='error'", () => {
    useChatStore.getState().applyEvent(turnStarted());
    useChatStore.getState().applyEvent(turnAborted({ reason: "error" }));
    expect(useChatStore.getState().turnsByThread.thr_a?.turn_1?.state).toBe("error");
  });

  it("turn.completed can land before turn.started without crashing", () => {
    // Replay edge case — the catchup REST endpoint sends events sorted by
    // seq but if the WS race interleaves a completed with a missed started,
    // the store still records the latest known shape.
    useChatStore.getState().applyEvent(turnCompleted());
    const turn = useChatStore.getState().turnsByThread.thr_a?.turn_1;
    expect(turn?.state).toBe("completed");
  });
});

describe("chat-v2 store: checkpoint + plan + revert reducers", () => {
  it("checkpoint.created records the summary keyed by turnId", () => {
    const event: ChatCheckpointCreatedEvent = {
      type: "chat.checkpoint.created",
      threadId: "thr_a",
      checkpoint: checkpoint(),
    };
    useChatStore.getState().applyEvent(event);
    const stored = useChatStore.getState().checkpointsByThread.thr_a?.turn_1;
    expect(stored?.checkpointRef).toBe("deadbeef");
  });

  it("plan.upserted records the plan keyed by planId", () => {
    const event: ChatPlanUpsertedEvent = {
      type: "chat.plan.upserted",
      threadId: "thr_a",
      plan: plan(),
    };
    useChatStore.getState().applyEvent(event);
    expect(useChatStore.getState().plansByThread.thr_a?.plan_1?.planMarkdown).toBe(
      "## Plan",
    );
  });

  it("plan.upserted overwrites a plan with the same id", () => {
    useChatStore.getState().applyEvent({
      type: "chat.plan.upserted",
      threadId: "thr_a",
      plan: plan({ planMarkdown: "v1" }),
    });
    useChatStore.getState().applyEvent({
      type: "chat.plan.upserted",
      threadId: "thr_a",
      plan: plan({ planMarkdown: "v2" }),
    });
    expect(useChatStore.getState().plansByThread.thr_a?.plan_1?.planMarkdown).toBe("v2");
  });

  it("thread.reverted appends a revert marker to the activity log", () => {
    const event: ChatThreadRevertedEvent = {
      type: "chat.thread.reverted",
      threadId: "thr_a",
      toCheckpointRef: "abcdef12",
    };
    useChatStore.getState().applyEvent(event);
    const list = useChatStore.getState().activitiesByThread.thr_a ?? [];
    expect(list.find((a) => a.kind === "revert")?.summary).toContain("abcdef12");
  });

  it("unrecognized event types are ignored without throwing", () => {
    expect(() =>
      useChatStore.getState().applyEvent({
        // @ts-expect-error — intentionally invalid
        type: "chat.unknown",
        threadId: "thr_a",
      }),
    ).not.toThrow();
  });
});
