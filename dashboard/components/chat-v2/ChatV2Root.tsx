/**
 * T077 — Chat v2 surface. Vertical split: ThreadListRail (left, ~240px)
 * + ThreadView (right, flex). State lives in the chat-v2 zustand store;
 * WS frames flow in through `useChatV2WsBridge`.
 *
 * Inputs come from V2ChatView (the legacy chat surface that owns thread
 * CRUD via @/lib/api). Send / revert callbacks are passed through so
 * this file stays free of network code — easier to unit-test, easier to
 * port to other transports.
 */

"use client";

import { useEffect, useState } from "react";
import type { MentionCandidate } from "@tmux-ide/chat-solid";
import type { ThreadIndexEntry } from "./types";
import { fetchThreadTurnDiffs, type TurnDiffEntry } from "@/lib/api";
import { ThreadListRail } from "./ThreadListRail";
import { ThreadView } from "./ThreadView";
import { useChatStore } from "./useChatStore";
import { useOrchestrationRecovery } from "./useOrchestrationRecovery";
import { useChatV2WsBridge } from "./useWsBridge";

export interface ChatV2RootProps {
  projectName: string;
  threads: ThreadIndexEntry[];
  activeThreadId: string | null;
  onPickThread(id: string): void;
  onNewThread(): void;
  onDeleteThread?(id: string): void;
  /** Submit a user message in the active thread. Wired in V2ChatView. */
  onSend(threadId: string, text: string): void;
  /** Revert the active thread to a checkpoint. Wired by T076/T075. */
  onRevert?(threadId: string, checkpointRef: string): void;
  /**
   * Candidates surfaced by the composer's @-mention autocomplete. Host
   * (V2ChatView) composes files + threads + agents + skills and pushes
   * the merged array here. Falsy / empty suppresses the menu.
   */
  mentionCandidates?: ReadonlyArray<MentionCandidate>;
}

// Stable empty references so selectors don't return new literals each render —
// zustand v5's getSnapshot check throws "infinite loop" otherwise.
const EMPTY_ACTIVITIES: ReadonlyArray<unknown> = [];
const EMPTY_MAP: Readonly<Record<string, unknown>> = {};

export function ChatV2Root(props: ChatV2RootProps) {
  useChatV2WsBridge(props.projectName);
  useOrchestrationRecovery(props.activeThreadId);

  const setThreads = useChatStore((s) => s.setThreads);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const activities = useChatStore((s) =>
    props.activeThreadId
      ? (s.activitiesByThread[props.activeThreadId] ?? (EMPTY_ACTIVITIES as never))
      : (EMPTY_ACTIVITIES as never),
  );
  const turns = useChatStore((s) =>
    props.activeThreadId
      ? (s.turnsByThread[props.activeThreadId] ?? (EMPTY_MAP as never))
      : (EMPTY_MAP as never),
  );
  const checkpoints = useChatStore((s) =>
    props.activeThreadId
      ? (s.checkpointsByThread[props.activeThreadId] ?? (EMPTY_MAP as never))
      : (EMPTY_MAP as never),
  );
  const plans = useChatStore((s) =>
    props.activeThreadId
      ? (s.plansByThread[props.activeThreadId] ?? (EMPTY_MAP as never))
      : (EMPTY_MAP as never),
  );
  const unreadByThread = useChatStore((s) => s.unreadByThread);

  // Sync the parent-managed thread list + active thread into the store.
  useEffect(() => setThreads(props.threads), [props.threads, setThreads]);
  useEffect(() => setActiveThread(props.activeThreadId), [props.activeThreadId, setActiveThread]);

  // T101a — per-turn file diffs for the active thread. Reactor-driven
  // updates would normally flow through WS, but the projection is
  // checkpoint-event-shaped (only updates when a turn completes with a
  // checkpoint) so a pull-on-thread-change is plenty for now. The
  // `checkpoints` count changing is the canonical trigger to refresh.
  const [diffsByTurn, setDiffsByTurn] = useState<Record<string, ReadonlyArray<TurnDiffEntry>>>({});
  const checkpointCount = Object.keys(checkpoints as Record<string, unknown>).length;
  useEffect(() => {
    if (!props.activeThreadId) {
      setDiffsByTurn({});
      return;
    }
    const threadId = props.activeThreadId;
    let cancelled = false;
    void fetchThreadTurnDiffs(props.projectName, threadId).then((next) => {
      if (!cancelled) setDiffsByTurn(next);
    });
    return () => {
      cancelled = true;
    };
  }, [props.projectName, props.activeThreadId, checkpointCount]);

  const activeThread =
    props.activeThreadId !== null
      ? (props.threads.find((t) => t.id === props.activeThreadId) ?? null)
      : null;

  return (
    <div
      data-testid="chat-v2-root"
      data-project={props.projectName}
      className="font-sans flex h-full min-h-0 flex-row text-[12px]"
    >
      <ThreadListRail
        threads={props.threads}
        activeId={props.activeThreadId}
        unreadByThread={unreadByThread}
        onPick={props.onPickThread}
        onNew={props.onNewThread}
        onDelete={props.onDeleteThread}
      />
      <ThreadView
        thread={activeThread}
        activities={activities}
        turns={turns}
        checkpointsByTurn={checkpoints}
        plansById={plans}
        diffsByTurn={diffsByTurn}
        mentionCandidates={props.mentionCandidates}
        onSubmit={(text) => {
          if (!props.activeThreadId) return;
          // Optimistic UI: synthesize a `chat.activity.appended` event
          // so the user's message appears in the stream the instant
          // they hit Send. Without this the message wouldn't surface
          // until the page is reloaded — the daemon's chat-v2 internal
          // bus currently doesn't bridge activity events to /ws/events
          // (only `chat.thread.index` is broadcast), so the live WS
          // path is silent for new sends. The store's
          // applyActivityAppended is idempotent (dedup by activity.id),
          // so a future daemon-side broadcast or a reload-rehydrate
          // won't double-render this row.
          //
          // Dispatched here (not in V2ChatView) so the optimistic write
          // and the selector subscription resolve to the same useChatStore
          // module instance — V2ChatView is loaded via next/dynamic
          // (ssr: false), which can produce a separate chunk and a
          // duplicate zustand store identity in some bundler modes.
          const trimmed = text.trim();
          if (!trimmed) return;
          const now = new Date().toISOString();
          useChatStore.getState().applyEvent({
            type: "chat.activity.appended",
            threadId: props.activeThreadId,
            // seq=0 is benign — the reducer uses Math.max(prev, seq)
            // for lastSeqByThread, so this won't clobber a higher real
            // seq from hydration or a future WS event.
            seq: 0,
            activity: {
              id: `optimistic:${props.activeThreadId}:${Date.now()}`,
              tone: "info",
              kind: "user_prompt",
              summary: trimmed,
              payload: [{ type: "text", text: trimmed }],
              turnId: null,
              createdAt: now,
            },
          });
          props.onSend(props.activeThreadId, trimmed);
        }}
        onRevert={(ref) => {
          if (props.activeThreadId) props.onRevert?.(props.activeThreadId, ref);
        }}
      />
    </div>
  );
}
