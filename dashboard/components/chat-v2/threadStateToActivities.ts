/**
 * Synthesizes chat-v2 store entries from a materialized ThreadState
 * (returned by `GET /api/threads/:id`). Used by orchestrationRecovery
 * to seed the in-memory store on chat-v2 mount / thread switch, so the
 * UI is non-empty before the WS bridge catches up.
 *
 * The function is total over the `SessionUpdate` discriminator — every
 * variant produces a deterministically-keyed `ActivityView` so re-running
 * the hydrator over the same snapshot is idempotent (the store's
 * applyActivityAppended reducer also dedupes by activity.id).
 *
 * Turn detection: we group consecutive AgentUpdate messages into
 * synthetic turns delimited by UserPrompt boundaries. The trailing
 * group, if it isn't closed by a final `agent_message_chunk` that looks
 * complete, is marked `state: "running"` — that's the in-flight resume
 * signal the UI uses to show a streaming indicator.
 */

import type { ActivityView, TurnSummary } from "./useChatStore";
import type { SessionUpdate, ThreadMessage, ThreadState } from "./types";

interface HydrationResult {
  activities: ActivityView[];
  turns: Record<string, TurnSummary>;
}

interface AgentUpdateMsg {
  _tag: "AgentUpdate";
  id: string;
  createdAt: string;
  update: SessionUpdate;
}

function summarizeUpdate(update: SessionUpdate): { kind: string; tone: ActivityView["tone"]; summary: string } {
  const sessionUpdate = update.sessionUpdate;
  switch (sessionUpdate) {
    case "agent_message_chunk": {
      const block = (update as { content?: { type?: string; text?: string } }).content;
      const text = typeof block?.text === "string" ? block.text : "";
      return {
        kind: "agent_message",
        tone: "info",
        summary: text || "(streaming)",
      };
    }
    case "agent_thought_chunk":
      return { kind: "agent_thought", tone: "info", summary: "(thought)" };
    case "user_message_chunk": {
      const block = (update as { content?: { type?: string; text?: string } }).content;
      return { kind: "user_message", tone: "info", summary: block?.text ?? "" };
    }
    case "tool_call": {
      const title = (update as { title?: string }).title ?? "tool";
      return { kind: "tool_call", tone: "tool", summary: title };
    }
    case "tool_call_update": {
      const title = (update as { title?: string | null }).title ?? "tool update";
      const status = (update as { status?: string | null }).status;
      return {
        kind: "tool_call_update",
        tone: status === "failed" ? "error" : "tool",
        summary: status ? `${title} · ${status}` : title,
      };
    }
    case "plan":
      return { kind: "plan", tone: "info", summary: "plan updated" };
    case "available_commands_update":
      return { kind: "commands", tone: "info", summary: "commands updated" };
    case "current_mode_update":
      return { kind: "mode", tone: "info", summary: "mode updated" };
    default:
      return { kind: sessionUpdate || "update", tone: "info", summary: "" };
  }
}

function deriveTurnId(threadId: string, turnIndex: number): string {
  return `${threadId}:hydrated-turn:${turnIndex}`;
}

function isAssistantMessageChunk(msg: ThreadMessage): boolean {
  return msg._tag === "AgentUpdate" && msg.update.sessionUpdate === "agent_message_chunk";
}

export function threadStateToActivities(threadId: string, state: ThreadState): HydrationResult {
  const activities: ActivityView[] = [];
  const turns: Record<string, TurnSummary> = {};

  let turnIndex = 0;
  let currentTurnId: string | null = null;
  let lastAgentMessageId: string | null = null;
  let lastAgentMessageAt: string | null = null;
  let assistantSeenInCurrentTurn = false;

  for (let i = 0; i < state.messages.length; i += 1) {
    const msg = state.messages[i]!;
    const seq = i; // synthetic; coordinator uses these to compare against live WS seq.

    if (msg._tag === "UserPrompt") {
      // Close the previous turn (if any) as `completed` — we'll
      // re-open the trailing one below if it remains in-flight.
      if (currentTurnId !== null) {
        const existing = turns[currentTurnId];
        if (existing && existing.state === "running") {
          turns[currentTurnId] = {
            ...existing,
            state: "completed",
            completedAt: lastAgentMessageAt ?? msg.createdAt,
            assistantMessageId: lastAgentMessageId,
          };
        }
      }

      currentTurnId = deriveTurnId(threadId, turnIndex);
      turns[currentTurnId] = {
        threadId,
        turnId: currentTurnId,
        state: "running",
        requestedAt: msg.createdAt,
        completedAt: null,
        assistantMessageId: null,
      };
      turnIndex += 1;
      assistantSeenInCurrentTurn = false;
      lastAgentMessageId = null;
      lastAgentMessageAt = null;

      const text = msg.content
        .map((c) => ("text" in c ? c.text : ""))
        .filter(Boolean)
        .join(" ");
      activities.push({
        id: msg.id,
        tone: "info",
        kind: "user_prompt",
        summary: text || "(user prompt)",
        payload: msg.content,
        turnId: currentTurnId,
        sequence: seq,
        createdAt: msg.createdAt,
      });
      continue;
    }

    // AgentUpdate
    const update = (msg as AgentUpdateMsg).update;
    const meta = summarizeUpdate(update);
    activities.push({
      id: msg.id,
      tone: meta.tone,
      kind: meta.kind,
      summary: meta.summary,
      payload: update,
      turnId: currentTurnId,
      sequence: seq,
      createdAt: msg.createdAt,
    });

    if (isAssistantMessageChunk(msg)) {
      assistantSeenInCurrentTurn = true;
      lastAgentMessageId = msg.id;
      lastAgentMessageAt = msg.createdAt;
    }
  }

  // Close the trailing turn. Heuristic: if the last message is an
  // AgentUpdate AND no `stop_reason` event has been recorded (the
  // ThreadState shape we get back doesn't carry a turn-stop flag — the
  // store's TurnSummary tracks that via WS), we conservatively leave the
  // turn marked `running`. The WS bridge will issue the actual
  // `chat.turn.completed` event when the daemon closes the turn.
  if (currentTurnId !== null) {
    const trailing = state.messages[state.messages.length - 1];
    const trailingIsUserPrompt = trailing?._tag === "UserPrompt";
    if (trailingIsUserPrompt) {
      // User typed but agent hasn't responded yet — running.
      // (Already set when the prompt was processed above.)
    } else if (!assistantSeenInCurrentTurn) {
      // No assistant output at all — treat as still running.
    } else {
      // We have an assistant chunk and no stop signal — leave running so
      // the UI keeps the streaming indicator. The next WS turn-completed
      // event will close it.
    }
  }

  return { activities, turns };
}
