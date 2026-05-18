/**
 * Incremental row reducer — the streaming hot path.
 *
 * `coalesceMessages` (coalesce.ts) is a pure O(N) rebuild: every call
 * reallocates every row / message / toolCall object, so a streaming
 * turn produced a brand-new `rows` array each token and Solid could
 * do no fine-grained DOM work. This module instead applies one
 * `ThreadMessage` at a time INTO a persistent `MessagesTimelineRow[]`
 * (the Solid store's `rows`), mutating only the row that actually
 * changed. A streaming assistant turn grows that single row's
 * `.text` in place; every sibling row keeps referential identity, so
 * Solid updates exactly one text node per token instead of the whole
 * transcript.
 *
 * The grouping rules are a faithful port of `coalesceMessages`'s
 * switch (turn boundaries, thought vs text, tool-call merge, plan
 * replace, no-row side-channels). `coalesceMessages` is retained as
 * the one-shot bootstrap path for thread history; this reducer drives
 * everything live after that.
 *
 * `streaming` is keyed on the active turn's promptId (a `RowCursor`
 * field), not a global inflight flag — the caret renders from the
 * first chunk of the active turn and a stop / optimistic-cancel for
 * that prompt clears it, so concurrent or replayed turns stay
 * correct.
 */

import {
  assignRevertTurnCounts,
  assistantHasVisibleContent,
  mergeToolCallUpdate,
} from "./coalesce";
import type {
  ChatMessage,
  MessagesTimelineRow,
  SessionUpdate,
  StopReason,
  ThreadMessage,
} from "./types";

type MessageRow = Extract<MessagesTimelineRow, { kind: "message" }>;
type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

export interface RowCursor {
  /** Mirrors coalesce's turnIndex — drives the assistant row id. */
  turnIndex: number;
  /** Id of the assistant row the current turn is appending into. */
  currentAssistantRowId: string | null;
  /** Id of the plan row being replaced within the current turn. */
  currentPlanRowId: string | null;
  /** Id of the user row that `user_message_chunk` extends. */
  latestUserRowId: string | null;
  /** PromptId of the turn that owns the live streaming caret. */
  activePromptId: string | null;
}

export function createRowCursor(): RowCursor {
  return {
    turnIndex: -1,
    currentAssistantRowId: null,
    currentPlanRowId: null,
    latestUserRowId: null,
    activePromptId: null,
  };
}

function messageRowById(rows: MessagesTimelineRow[], id: string | null): MessageRow | null {
  if (!id) return null;
  for (const row of rows) {
    if (row.kind === "message" && row.id === id) return row;
  }
  return null;
}

function workingRowId(assistantId: string): string {
  return `${assistantId}:working`;
}

function removeWorkingRow(rows: MessagesTimelineRow[], assistantId: string): void {
  const id = workingRowId(assistantId);
  const index = rows.findIndex((row) => row.kind === "working" && row.id === id);
  if (index !== -1) rows.splice(index, 1);
}

/**
 * Reflect the active turn's streaming state onto its assistant row.
 * While the prompt is live the row's `.streaming` is true and an
 * empty turn shows a trailing `working` row (same id/shape as
 * coalesce's working row); once any content lands the working row is
 * dropped. No-op unless the cursor has an active prompt.
 */
function syncStreaming(rows: MessagesTimelineRow[], cursor: RowCursor): void {
  if (!cursor.activePromptId) return;
  const row = messageRowById(rows, cursor.currentAssistantRowId);
  if (!row || row.message.role !== "assistant") return;
  const assistant = row.message;
  assistant.streaming = true;
  if (assistantHasVisibleContent(assistant)) {
    removeWorkingRow(rows, assistant.id);
    return;
  }
  const id = workingRowId(assistant.id);
  if (!rows.some((candidate) => candidate.kind === "working" && candidate.id === id)) {
    rows.push({ kind: "working", id, createdAt: assistant.createdAt });
  }
}

function ensureAssistantRow(
  rows: MessagesTimelineRow[],
  cursor: RowCursor,
  sourceId: string,
  createdAt: string,
): AssistantMessage {
  const existing = messageRowById(rows, cursor.currentAssistantRowId);
  if (existing && existing.message.role === "assistant") return existing.message;

  const id = `assistant:${cursor.turnIndex < 0 ? "orphan" : cursor.turnIndex}:${sourceId}`;
  const message: AssistantMessage = {
    id,
    role: "assistant",
    createdAt,
    streaming: false,
    text: "",
    toolCalls: [],
  };
  rows.push({ kind: "message", id, createdAt, message });
  cursor.currentAssistantRowId = id;
  return message;
}

/**
 * Apply one user prompt. Opens a new turn (mirrors coalesce: bump
 * turnIndex, clear the assistant/plan cursors) and pushes the user
 * row. Marks the turn active so the next agent chunk streams.
 */
export function applyUserPromptToRows(
  rows: MessagesTimelineRow[],
  cursor: RowCursor,
  message: Extract<ThreadMessage, { _tag: "UserPrompt" }>,
  promptId: string | null,
): void {
  cursor.turnIndex += 1;
  cursor.currentAssistantRowId = null;
  cursor.currentPlanRowId = null;
  cursor.latestUserRowId = message.id;
  cursor.activePromptId = promptId;
  rows.push({
    kind: "message",
    id: message.id,
    createdAt: message.createdAt,
    message: {
      id: message.id,
      role: "user",
      createdAt: message.createdAt,
      content: [...message.content],
    },
  });
  // A new user turn makes every prior user row rewindable (its
  // trailing-turn count just grew). Re-stamp in place so the live
  // path matches the coalesce bootstrap.
  assignRevertTurnCounts(rows);
}

/**
 * Apply one agent update into `rows`. Faithful port of the
 * `coalesceMessages` switch, mutating the persistent rows in place
 * (the streaming assistant row grows its `.text` rather than being
 * reallocated). `sourceId` is the synthetic id used to seed a new
 * assistant row's id (the WS frame's `agent-update:<seq>`), matching
 * the bootstrap path's stability within a turn.
 */
export function applyAgentUpdateToRows(
  rows: MessagesTimelineRow[],
  cursor: RowCursor,
  sourceId: string,
  createdAt: string,
  update: SessionUpdate,
): void {
  const assistant = ensureAssistantRow(rows, cursor, sourceId, createdAt);

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const u = update as Extract<SessionUpdate, { sessionUpdate: "agent_message_chunk" }>;
      if (u.content.type === "text") assistant.text += u.content.text;
      break;
    }
    case "agent_thought_chunk": {
      const u = update as Extract<SessionUpdate, { sessionUpdate: "agent_thought_chunk" }>;
      if (u.content.type === "text") {
        assistant.thoughtText = `${assistant.thoughtText ?? ""}${u.content.text}`;
      }
      break;
    }
    case "user_message_chunk": {
      const u = update as Extract<SessionUpdate, { sessionUpdate: "user_message_chunk" }>;
      const userRow = messageRowById(rows, cursor.latestUserRowId);
      if (userRow && userRow.message.role === "user") {
        userRow.message.content = [...userRow.message.content, u.content];
      }
      break;
    }
    case "tool_call": {
      const u = update as Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;
      assistant.toolCalls.push({
        toolCallId: u.toolCallId,
        title: u.title,
        ...(u.kind ? { kind: u.kind } : {}),
        status: u.status ?? "pending",
        content: [...(u.content ?? [])],
        ...(u.rawInput !== undefined ? { rawInput: u.rawInput } : {}),
        ...(u.rawOutput !== undefined ? { rawOutput: u.rawOutput } : {}),
      });
      break;
    }
    case "tool_call_update": {
      const u = update as Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>;
      mergeToolCallUpdate(assistant.toolCalls, {
        toolCallId: u.toolCallId,
        title: u.title ?? undefined,
        kind: u.kind ?? undefined,
        status: u.status ?? undefined,
        content: u.content ?? undefined,
        rawInput: u.rawInput,
        rawOutput: u.rawOutput,
      });
      break;
    }
    case "plan": {
      const u = update as Extract<SessionUpdate, { sessionUpdate: "plan" }>;
      const planRow: Extract<MessagesTimelineRow, { kind: "plan" }> = {
        kind: "plan",
        id: cursor.currentPlanRowId ?? `plan:${sourceId}`,
        createdAt,
        entries: [...u.entries],
      };
      if (cursor.currentPlanRowId) {
        const index = rows.findIndex((row) => row.id === cursor.currentPlanRowId);
        if (index !== -1) rows[index] = planRow;
      } else {
        cursor.currentPlanRowId = planRow.id;
        rows.push(planRow);
      }
      break;
    }
    case "available_commands_update":
    case "current_mode_update":
      break;
    default:
      break;
  }

  syncStreaming(rows, cursor);
}

/**
 * Close out the active turn's streaming row. Called from the
 * `chat.thread.stop` frame and from optimistic cancel. Idempotent:
 * a second call (real stop after an optimistic cancel) is a no-op
 * because the cursor's active prompt is already cleared.
 */
export function finishStreamingRows(
  rows: MessagesTimelineRow[],
  cursor: RowCursor,
  promptId: string | null,
  stopReason: StopReason,
  completedAt: string,
): void {
  if (cursor.activePromptId && promptId && cursor.activePromptId !== promptId) return;
  const row = messageRowById(rows, cursor.currentAssistantRowId);
  if (row && row.message.role === "assistant") {
    const assistant = row.message;
    assistant.streaming = false;
    assistant.stopReason = stopReason;
    assistant.completedAt = completedAt;
    removeWorkingRow(rows, assistant.id);
  }
  cursor.activePromptId = null;
}
