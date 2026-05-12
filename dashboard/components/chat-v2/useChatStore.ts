/**
 * T077 — Chat v2 zustand store.
 *
 * One global store keyed by threadId. The store is a thin reducer over
 * the t3-style events the daemon emits (T074). UI components subscribe
 * via narrow selectors; the WS bridge calls applyEvent() for every
 * incoming `chat.<aggregate>.<verb>` event.
 *
 * Surface:
 *   - `threads`: index of ThreadIndexEntry returned by the REST list.
 *   - `activeThreadId`: which thread the UI is focused on.
 *   - `activitiesByThread`: append-only ThreadActivity[] keyed by thread.
 *   - `turnsByThread`: per-thread Map<turnId, TurnSummary>.
 *   - `checkpointsByThread`: per-thread Map<turnId, CheckpointSummary>.
 *   - `unreadByThread`: per-thread count of events appended since the
 *     thread was last visited (`markVisited`).
 *
 * Pure-data only — no DOM access, no fetch — so the store can be
 * unit-tested headlessly with vitest.
 */

import { create } from "zustand";
import type {
  ChatActivityAppendedEvent,
  ChatBusEvent,
  ChatCheckpointCreatedEvent,
  ChatPlanUpsertedEvent,
  ChatThreadRevertedEvent,
  ChatTurnAbortedEvent,
  ChatTurnCompletedEvent,
  ChatTurnStartedEvent,
  ThreadIndexEntry,
  ThreadMessage,
  ThreadState,
} from "./types";
import { threadStateToActivities } from "./threadStateToActivities";

export interface TurnSummary {
  threadId: string;
  turnId: string;
  state: "running" | "completed" | "interrupted" | "error";
  requestedAt: string;
  completedAt: string | null;
  assistantMessageId: string | null;
  abortReason?: "cancelled" | "interrupted" | "error";
}

export interface CheckpointSummaryView {
  turnId: string;
  checkpointTurnCount: number;
  checkpointRef: string;
  status: "ready" | "missing" | "error";
  files: Array<{ path: string; kind: string; additions: number; deletions: number }>;
  assistantMessageId: string | null;
  completedAt: string;
}

export interface ProposedPlanView {
  id: string;
  turnId: string | null;
  planMarkdown: string;
  implementedAt: string | null;
  implementationThreadId: string | null;
  rejected?: { at: string; reason?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ActivityView {
  id: string;
  tone: "info" | "tool" | "approval" | "error";
  kind: string;
  summary: string;
  payload: unknown;
  turnId: string | null;
  sequence?: number;
  createdAt: string;
}

export interface ChatV2State {
  threads: ThreadIndexEntry[];
  activeThreadId: string | null;
  activitiesByThread: Record<string, ActivityView[]>;
  turnsByThread: Record<string, Record<string, TurnSummary>>;
  checkpointsByThread: Record<string, Record<string, CheckpointSummaryView>>;
  plansByThread: Record<string, Record<string, ProposedPlanView>>;
  unreadByThread: Record<string, number>;
  /** Highest seq we've ingested per thread — used for replay queries. */
  lastSeqByThread: Record<string, number>;
}

export interface ChatV2Actions {
  setThreads(threads: ThreadIndexEntry[]): void;
  upsertThread(thread: ThreadIndexEntry): void;
  removeThread(threadId: string): void;
  setActiveThread(threadId: string | null): void;
  markVisited(threadId: string): void;
  /**
   * Apply a single t3-style chat event to the store. The reducer is
   * total over the discriminated union — every variant has a branch.
   */
  applyEvent(event: ChatBusEvent): void;
  /**
   * Hydrate per-thread state from the materialized thread snapshot
   * returned by `GET /api/threads/:id`. Used by orchestrationRecovery
   * on chat-v2 mount / thread switch so the UI is non-empty before the
   * WS bridge catches up. Idempotent — calling twice replaces whatever
   * was synthesized last time; live WS events that arrive after this
   * call are still applied (drop-dup is by activity.id).
   */
  hydrateFromThreadState(threadId: string, state: ThreadState): void;
  /** Reset store to initial state (testing). */
  reset(): void;
}

const initialState: ChatV2State = {
  threads: [],
  activeThreadId: null,
  activitiesByThread: {},
  turnsByThread: {},
  checkpointsByThread: {},
  plansByThread: {},
  unreadByThread: {},
  lastSeqByThread: {},
};

export const useChatStore = create<ChatV2State & ChatV2Actions>()((set, get) => ({
  ...initialState,

  setThreads(threads) {
    set({ threads });
  },

  upsertThread(thread) {
    set((s) => {
      const existing = s.threads.findIndex((t) => t.id === thread.id);
      const next = [...s.threads];
      if (existing >= 0) next[existing] = thread;
      else next.unshift(thread);
      return { threads: next };
    });
  },

  removeThread(threadId) {
    set((s) => {
      const { [threadId]: _a, ...activitiesByThread } = s.activitiesByThread;
      const { [threadId]: _t, ...turnsByThread } = s.turnsByThread;
      const { [threadId]: _c, ...checkpointsByThread } = s.checkpointsByThread;
      const { [threadId]: _p, ...plansByThread } = s.plansByThread;
      const { [threadId]: _u, ...unreadByThread } = s.unreadByThread;
      const { [threadId]: _s, ...lastSeqByThread } = s.lastSeqByThread;
      void _a;
      void _t;
      void _c;
      void _p;
      void _u;
      void _s;
      return {
        threads: s.threads.filter((t) => t.id !== threadId),
        activeThreadId: s.activeThreadId === threadId ? null : s.activeThreadId,
        activitiesByThread,
        turnsByThread,
        checkpointsByThread,
        plansByThread,
        unreadByThread,
        lastSeqByThread,
      };
    });
  },

  setActiveThread(threadId) {
    set({ activeThreadId: threadId });
    if (threadId) get().markVisited(threadId);
  },

  markVisited(threadId) {
    set((s) => ({
      unreadByThread: { ...s.unreadByThread, [threadId]: 0 },
    }));
  },

  applyEvent(event) {
    switch (event.type) {
      case "chat.activity.appended":
        return applyActivityAppended(set, get, event);
      case "chat.turn.started":
        return applyTurnStarted(set, event);
      case "chat.turn.completed":
        return applyTurnCompleted(set, event);
      case "chat.turn.aborted":
        return applyTurnAborted(set, event);
      case "chat.checkpoint.created":
        return applyCheckpointCreated(set, event);
      case "chat.plan.upserted":
        return applyPlanUpserted(set, event);
      case "chat.thread.reverted":
        return applyThreadReverted(set, event);
      // Legacy / non-v2 events are ignored by this store. The bridge
      // still passes them in so we can fan-out logging if needed.
      default:
        return;
    }
  },

  hydrateFromThreadState(threadId, state) {
    const { activities, turns } = threadStateToActivities(threadId, state);
    set((s) => ({
      activitiesByThread: {
        ...s.activitiesByThread,
        [threadId]: activities,
      },
      turnsByThread: {
        ...s.turnsByThread,
        [threadId]: turns,
      },
      // Hydration produces synthetic seqs; track the highest one so the
      // WS bridge can compare incoming live events against it.
      lastSeqByThread: {
        ...s.lastSeqByThread,
        [threadId]: activities.reduce(
          (max, a) => Math.max(max, a.sequence ?? -1),
          s.lastSeqByThread[threadId] ?? -1,
        ),
      },
    }));
  },

  reset() {
    set({ ...initialState });
  },
}));

// ---------------------------------------------------------------------------
// Reducer branches — kept as standalone functions so the test file can
// exercise them without going through the store hook.
// ---------------------------------------------------------------------------

type SetFn = (
  partial:
    | Partial<ChatV2State & ChatV2Actions>
    | ((state: ChatV2State & ChatV2Actions) => Partial<ChatV2State & ChatV2Actions>),
) => void;
type GetFn = () => ChatV2State & ChatV2Actions;

function applyActivityAppended(set: SetFn, get: GetFn, event: ChatActivityAppendedEvent): void {
  const state = get();
  const { threadId, activity, seq } = event;
  const prior = state.activitiesByThread[threadId] ?? [];
  // Idempotent — drop duplicates (replay can resend events we already have).
  if (prior.some((a) => a.id === activity.id)) return;
  set({
    activitiesByThread: { ...state.activitiesByThread, [threadId]: [...prior, activity] },
    lastSeqByThread: {
      ...state.lastSeqByThread,
      [threadId]: Math.max(state.lastSeqByThread[threadId] ?? -1, seq),
    },
    unreadByThread:
      state.activeThreadId === threadId
        ? state.unreadByThread
        : { ...state.unreadByThread, [threadId]: (state.unreadByThread[threadId] ?? 0) + 1 },
  });
}

function applyTurnStarted(set: SetFn, event: ChatTurnStartedEvent): void {
  set((s) => {
    const threadTurns = s.turnsByThread[event.threadId] ?? {};
    const turn: TurnSummary = {
      threadId: event.threadId,
      turnId: event.turnId,
      state: "running",
      requestedAt: event.requestedAt,
      completedAt: null,
      assistantMessageId: null,
    };
    return {
      turnsByThread: {
        ...s.turnsByThread,
        [event.threadId]: { ...threadTurns, [event.turnId]: turn },
      },
    };
  });
}

function applyTurnCompleted(set: SetFn, event: ChatTurnCompletedEvent): void {
  set((s) => {
    const threadTurns = s.turnsByThread[event.threadId] ?? {};
    const existing = threadTurns[event.turnId];
    const next: TurnSummary = {
      threadId: event.threadId,
      turnId: event.turnId,
      state: event.state as TurnSummary["state"],
      requestedAt: existing?.requestedAt ?? event.completedAt,
      completedAt: event.completedAt,
      assistantMessageId: event.assistantMessageId ?? existing?.assistantMessageId ?? null,
    };
    return {
      turnsByThread: {
        ...s.turnsByThread,
        [event.threadId]: { ...threadTurns, [event.turnId]: next },
      },
    };
  });
}

function applyTurnAborted(set: SetFn, event: ChatTurnAbortedEvent): void {
  set((s) => {
    const threadTurns = s.turnsByThread[event.threadId] ?? {};
    const existing = threadTurns[event.turnId];
    const aborted: TurnSummary = {
      threadId: event.threadId,
      turnId: event.turnId,
      state: event.reason === "error" ? "error" : "interrupted",
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      completedAt: existing?.completedAt ?? new Date().toISOString(),
      assistantMessageId: existing?.assistantMessageId ?? null,
      abortReason: event.reason,
    };
    return {
      turnsByThread: {
        ...s.turnsByThread,
        [event.threadId]: { ...threadTurns, [event.turnId]: aborted },
      },
    };
  });
}

function applyCheckpointCreated(set: SetFn, event: ChatCheckpointCreatedEvent): void {
  set((s) => {
    const threadCheckpoints = s.checkpointsByThread[event.threadId] ?? {};
    return {
      checkpointsByThread: {
        ...s.checkpointsByThread,
        [event.threadId]: { ...threadCheckpoints, [event.checkpoint.turnId]: event.checkpoint },
      },
    };
  });
}

function applyPlanUpserted(set: SetFn, event: ChatPlanUpsertedEvent): void {
  set((s) => {
    const plans = s.plansByThread[event.threadId] ?? {};
    return {
      plansByThread: {
        ...s.plansByThread,
        [event.threadId]: { ...plans, [event.plan.id]: event.plan },
      },
    };
  });
}

function applyThreadReverted(set: SetFn, event: ChatThreadRevertedEvent): void {
  // No store mutation by itself — UI consumers may react (toast, scroll,
  // dim the affected turn). We expose the event via a transient marker
  // on the activity log so consumers can render a revert banner.
  set((s) => {
    const prior = s.activitiesByThread[event.threadId] ?? [];
    const marker: ActivityView = {
      id: `revert-${event.toCheckpointRef}`,
      tone: "info",
      kind: "revert",
      summary: `Reverted to checkpoint ${event.toCheckpointRef.slice(0, 8)}`,
      payload: { toCheckpointRef: event.toCheckpointRef },
      turnId: null,
      createdAt: new Date().toISOString(),
    };
    if (prior.some((a) => a.id === marker.id)) return s;
    return {
      activitiesByThread: { ...s.activitiesByThread, [event.threadId]: [...prior, marker] },
    };
  });
}

// ---------------------------------------------------------------------------
// Test reset helper
// ---------------------------------------------------------------------------

export function __resetChatStoreForTests(): void {
  useChatStore.setState({ ...initialState });
}
