/**
 * Chat v2 zustand store — post-migration trimmed surface.
 *
 * Before the chat-solid migration (20c5ebf), this store mirrored the
 * full t3 chat aggregate (activities, turns, checkpoints, plans, revert
 * markers). Post-migration chat-solid owns transcript state, so the
 * only things the React side still reads are the thread index and the
 * unread badge counter. The store has been trimmed accordingly:
 *
 *   - `threads`          — index of ThreadIndexEntry returned by REST list.
 *   - `activeThreadId`   — which thread the UI is focused on.
 *   - `unreadByThread`   — per-thread count of activity-appended events
 *                          since the thread was last visited.
 *   - `lastSeqByThread`  — highest seq seen per thread. Used both for
 *                          replay-safe dedup of incoming WS events and
 *                          as a future hook for catchup queries.
 *
 * `applyEvent` is now a one-case dispatcher: only
 * `chat.activity.appended` is observed (to bump unread + seq). Other
 * `chat.*` frames are intentionally ignored — chat-solid handles them.
 *
 * The `ActivityView` / `TurnSummary` / `CheckpointSummaryView` /
 * `ProposedPlanView` type aliases are kept as exports because
 * `dashboard/lib/historyBootstrap.ts` and the chat-v2 grouping helpers
 * still reference them as function-parameter shapes. They no longer
 * appear in `ChatV2State`.
 */

import { create } from "zustand";
import type {
  ChatActivityAppendedEvent,
  ChatBusEvent,
  ThreadIndexEntry,
} from "./types";

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
  unreadByThread: Record<string, number>;
  /** Highest seq we've ingested per thread — used for replay dedup. */
  lastSeqByThread: Record<string, number>;
}

export interface ChatV2Actions {
  setThreads(threads: ThreadIndexEntry[]): void;
  upsertThread(thread: ThreadIndexEntry): void;
  removeThread(threadId: string): void;
  setActiveThread(threadId: string | null): void;
  markVisited(threadId: string): void;
  /**
   * Apply a single t3-style chat event. The reducer ignores every
   * variant except `chat.activity.appended`, which bumps the unread
   * counter (when the thread isn't active) and advances `lastSeq`.
   */
  applyEvent(event: ChatBusEvent): void;
  /** Reset store to initial state (testing). */
  reset(): void;
}

const initialState: ChatV2State = {
  threads: [],
  activeThreadId: null,
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
      const { [threadId]: _u, ...unreadByThread } = s.unreadByThread;
      const { [threadId]: _s, ...lastSeqByThread } = s.lastSeqByThread;
      void _u;
      void _s;
      return {
        threads: s.threads.filter((t) => t.id !== threadId),
        activeThreadId: s.activeThreadId === threadId ? null : s.activeThreadId,
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
    if (event.type === "chat.activity.appended") {
      applyActivityAppended(set, get, event);
    }
    // All other chat.* frames are owned by chat-solid post-migration.
  },

  reset() {
    set({ ...initialState });
  },
}));

// ---------------------------------------------------------------------------
// Reducer — kept standalone so the test file can exercise it without the
// store hook.
// ---------------------------------------------------------------------------

type SetFn = (
  partial:
    | Partial<ChatV2State & ChatV2Actions>
    | ((state: ChatV2State & ChatV2Actions) => Partial<ChatV2State & ChatV2Actions>),
) => void;
type GetFn = () => ChatV2State & ChatV2Actions;

function applyActivityAppended(set: SetFn, get: GetFn, event: ChatActivityAppendedEvent): void {
  const state = get();
  const { threadId, seq } = event;
  const lastSeq = state.lastSeqByThread[threadId] ?? -1;
  // Idempotent over replay — the WS bus can resend frames the store
  // already saw. Seq is monotonic per thread, so anything <= lastSeq
  // is a duplicate.
  if (seq <= lastSeq) return;
  set({
    lastSeqByThread: { ...state.lastSeqByThread, [threadId]: seq },
    unreadByThread:
      state.activeThreadId === threadId
        ? state.unreadByThread
        : { ...state.unreadByThread, [threadId]: (state.unreadByThread[threadId] ?? 0) + 1 },
  });
}

// ---------------------------------------------------------------------------
// Test reset helper
// ---------------------------------------------------------------------------

export function __resetChatStoreForTests(): void {
  useChatStore.setState({ ...initialState });
}
