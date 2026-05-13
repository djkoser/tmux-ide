/**
 * chat-v2 zustand store tests — post-WN7 trimmed surface.
 *
 * The store no longer mirrors activities / turns / checkpoints / plans;
 * those branches are owned by chat-solid post-migration. Coverage here
 * focuses on the surviving responsibility: thread index CRUD + unread /
 * lastSeq tracking driven by `chat.activity.appended`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetChatStoreForTests,
  useChatStore,
} from "@/components/chat-v2/useChatStore";
import type {
  ChatActivityAppendedEvent,
  ThreadIndexEntry,
} from "@/components/chat-v2/types";

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

function activityAppended(
  overrides: Partial<ChatActivityAppendedEvent> = {},
): ChatActivityAppendedEvent {
  return {
    type: "chat.activity.appended",
    threadId: "thr_a",
    activity: {
      id: "evt_1",
      tone: "info",
      kind: "step",
      summary: "thinking",
      payload: null,
      turnId: "turn_1",
      sequence: 0,
      createdAt: "2026-05-11T10:00:00Z",
    },
    seq: 0,
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
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a" }));
    useChatStore.getState().removeThread("thr_a");
    const s = useChatStore.getState();
    expect(s.threads.map((t) => t.id)).toEqual(["thr_b"]);
    expect(s.activeThreadId).toBeNull();
    expect(s.unreadByThread.thr_a).toBeUndefined();
    expect(s.lastSeqByThread.thr_a).toBeUndefined();
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
  it("advances lastSeqByThread", () => {
    useChatStore.getState().applyEvent(activityAppended({ seq: 3 }));
    expect(useChatStore.getState().lastSeqByThread.thr_a).toBe(3);
  });

  it("is idempotent over replayed seq (replay safe)", () => {
    useChatStore.getState().setActiveThread("thr_b");
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a", seq: 0 }));
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a", seq: 0 }));
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(1);
    expect(useChatStore.getState().lastSeqByThread.thr_a).toBe(0);
  });

  it("ignores out-of-order frames whose seq has already been seen", () => {
    useChatStore.getState().setActiveThread("thr_b");
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a", seq: 5 }));
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a", seq: 2 }));
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(1);
    expect(useChatStore.getState().lastSeqByThread.thr_a).toBe(5);
  });

  it("increments unread on inactive thread", () => {
    useChatStore.getState().setActiveThread("thr_b");
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a", seq: 0 }));
    useChatStore.getState().applyEvent(activityAppended({ threadId: "thr_a", seq: 1 }));
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(2);
  });

  it("does not increment unread when the thread is active", () => {
    useChatStore.getState().setActiveThread("thr_a");
    useChatStore.getState().applyEvent(activityAppended());
    expect(useChatStore.getState().unreadByThread.thr_a).toBe(0);
  });

  it("ignores non-activity chat frames (owned by chat-solid post-migration)", () => {
    useChatStore.getState().setActiveThread("thr_b");
    useChatStore.getState().applyEvent({
      type: "chat.turn.started",
      threadId: "thr_a",
      turnId: "turn_1",
      requestedAt: "2026-05-11T10:00:00Z",
    });
    useChatStore.getState().applyEvent({
      type: "chat.checkpoint.created",
      threadId: "thr_a",
      checkpoint: {
        turnId: "turn_1",
        checkpointTurnCount: 1,
        checkpointRef: "deadbeef",
        status: "ready",
        files: [],
        assistantMessageId: null,
        completedAt: "2026-05-11T10:01:00Z",
      },
    });
    expect(useChatStore.getState().unreadByThread.thr_a).toBeUndefined();
    expect(useChatStore.getState().lastSeqByThread.thr_a).toBeUndefined();
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
