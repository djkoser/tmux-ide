/**
 * Pure selectors that group flat activity arrays by turn. Kept separate
 * from the zustand store so they can be unit-tested without React.
 *
 * Grouping rules:
 *   - One TurnGroup per turnId in the activity stream's first-seen order.
 *   - An additional "ambient" group (turnId === null) holds events not
 *     attached to a turn — render at the top of the stream.
 *   - Groups inherit Turn-state metadata from the turn record when one
 *     exists; otherwise default to "running" + null completedAt.
 *   - An "unfinished" group is one whose turn is still `running` OR whose
 *     last activity was less than `streamingIdleMs` ago.
 */

import type { ActivityView, TurnSummary } from "./useChatStore";

export interface TurnGroup {
  /** null = ambient (no-turn) bucket; otherwise the turnId. */
  turnId: string | null;
  /** Stable ordinal — 1-based for "Turn N" headers. Ambient is 0. */
  ordinal: number;
  state: "running" | "completed" | "interrupted" | "error";
  requestedAt: string | null;
  completedAt: string | null;
  assistantMessageId: string | null;
  activities: ActivityView[];
  unfinished: boolean;
}

export interface GroupingInput {
  activities: ActivityView[];
  turns: Record<string, TurnSummary>;
  /** Now-clock for unfinished detection. Defaults to `Date.now()`. */
  now?: number;
  /** Activity-quietness threshold for "unfinished" detection. */
  streamingIdleMs?: number;
}

const DEFAULT_STREAMING_IDLE_MS = 30_000;

export function groupActivitiesByTurn(input: GroupingInput): TurnGroup[] {
  const now = input.now ?? Date.now();
  const streamingIdleMs = input.streamingIdleMs ?? DEFAULT_STREAMING_IDLE_MS;
  const orderByTurnId = new Map<string | null, number>();
  const groups = new Map<string | null, TurnGroup>();
  let nextOrdinal = 0;
  for (const a of input.activities) {
    const tid = a.turnId ?? null;
    if (!groups.has(tid)) {
      const turnRecord = tid !== null ? input.turns[tid] : undefined;
      const ordinal = tid === null ? 0 : ++nextOrdinal;
      orderByTurnId.set(tid, ordinal);
      groups.set(tid, {
        turnId: tid,
        ordinal,
        state: turnRecord?.state ?? "running",
        requestedAt: turnRecord?.requestedAt ?? null,
        completedAt: turnRecord?.completedAt ?? null,
        assistantMessageId: turnRecord?.assistantMessageId ?? null,
        activities: [],
        unfinished: false,
      });
    }
    groups.get(tid)!.activities.push(a);
  }
  // Also seed groups for known turns that have NO activities yet —
  // happens when chat.turn.started arrives before any chat.activity.appended.
  for (const turnId of Object.keys(input.turns)) {
    if (!groups.has(turnId)) {
      const turnRecord = input.turns[turnId]!;
      const ordinal = ++nextOrdinal;
      orderByTurnId.set(turnId, ordinal);
      groups.set(turnId, {
        turnId,
        ordinal,
        state: turnRecord.state,
        requestedAt: turnRecord.requestedAt,
        completedAt: turnRecord.completedAt,
        assistantMessageId: turnRecord.assistantMessageId,
        activities: [],
        unfinished: false,
      });
    }
  }
  // Compute unfinished after groups are populated.
  for (const g of groups.values()) {
    g.unfinished = computeUnfinished(g, now, streamingIdleMs);
  }
  // Emit ambient (null) first, then turns by ordinal.
  return [...groups.values()].sort((a, b) => a.ordinal - b.ordinal);
}

function computeUnfinished(group: TurnGroup, now: number, _idleMs: number): boolean {
  if (group.turnId === null) return false;
  if (group.state === "running") return true;
  // The TurnSummary state is the source of truth — once it's terminal we
  // stop showing the streaming indicator. The `now`/`idleMs` parameters are
  // kept on the public surface so a future heuristic can override based on
  // recent activity timestamps without breaking callers.
  void now;
  void _idleMs;
  return false;
}

/**
 * Quick predicate — does this group represent an in-flight turn? Useful
 * for rendering streaming spinners and disabling the composer.
 */
export function isInFlight(group: TurnGroup): boolean {
  return group.unfinished || group.state === "running";
}

/**
 * Filter helpers used by the UI for keyboard navigation / shortcuts.
 */
export function findGroupByTurn(
  groups: ReadonlyArray<TurnGroup>,
  turnId: string,
): TurnGroup | undefined {
  return groups.find((g) => g.turnId === turnId);
}
