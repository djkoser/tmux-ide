/**
 * threadStateToActivities — staleness heuristic regression test.
 *
 * Background: before this fix, the hydrator always left the trailing
 * turn marked `state: "running"` because ThreadState carries no stop
 * flag. ThreadView reads `composerDisabled = groups.some(g => g.state
 * === "running")`, so opening any thread the user had previously
 * chatted in left the composer permanently disabled. Now we close
 * trailing turns whose last assistant chunk is older than 30s.
 */

import { describe, expect, it } from "vitest";
import { threadStateToActivities } from "../threadStateToActivities";
import type { ThreadState } from "../types";

function state(messages: ThreadState["messages"]): ThreadState {
  return {
    id: "thread-1",
    title: "test",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    provider: { kind: "claude-code" },
    messages,
  };
}

describe("threadStateToActivities — trailing turn closure", () => {
  it("marks the trailing turn `completed` when the last assistant chunk is older than 30s", () => {
    const lastChunkAt = "2026-05-12T00:00:00.000Z";
    const now = new Date(lastChunkAt).getTime() + 60_000; // 60s later
    const result = threadStateToActivities(
      "thread-1",
      state([
        {
          _tag: "UserPrompt",
          id: "u1",
          createdAt: lastChunkAt,
          content: [{ type: "text", text: "hi" }],
        },
        {
          _tag: "AgentUpdate",
          id: "a1",
          createdAt: lastChunkAt,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "hello" },
          },
        },
      ]),
      { now },
    );
    const turn = Object.values(result.turns)[0]!;
    expect(turn.state).toBe("completed");
    expect(turn.assistantMessageId).toBe("a1");
    expect(turn.completedAt).toBe(lastChunkAt);
  });

  it("keeps the trailing turn `running` while the last chunk is fresh (within 30s)", () => {
    const lastChunkAt = "2026-05-12T00:00:00.000Z";
    const now = new Date(lastChunkAt).getTime() + 5_000; // 5s later
    const result = threadStateToActivities(
      "thread-1",
      state([
        {
          _tag: "UserPrompt",
          id: "u1",
          createdAt: lastChunkAt,
          content: [{ type: "text", text: "hi" }],
        },
        {
          _tag: "AgentUpdate",
          id: "a1",
          createdAt: lastChunkAt,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "hello" },
          },
        },
      ]),
      { now },
    );
    const turn = Object.values(result.turns)[0]!;
    expect(turn.state).toBe("running");
  });

  it("leaves a turn with no assistant output `running` regardless of age", () => {
    const lastAt = "2026-05-12T00:00:00.000Z";
    const now = new Date(lastAt).getTime() + 60 * 60_000; // 1h later
    const result = threadStateToActivities(
      "thread-1",
      state([
        {
          _tag: "UserPrompt",
          id: "u1",
          createdAt: lastAt,
          content: [{ type: "text", text: "hi" }],
        },
      ]),
      { now },
    );
    const turn = Object.values(result.turns)[0]!;
    expect(turn.state).toBe("running");
  });

  it("preserves the staleness behavior for multi-turn threads (only the last turn is gated by age)", () => {
    const t1At = "2026-05-12T00:00:00.000Z";
    const t2At = "2026-05-12T01:00:00.000Z";
    const now = new Date(t2At).getTime() + 60_000; // 1m past t2's chunk
    const result = threadStateToActivities(
      "thread-1",
      state([
        {
          _tag: "UserPrompt",
          id: "u1",
          createdAt: t1At,
          content: [{ type: "text", text: "first" }],
        },
        {
          _tag: "AgentUpdate",
          id: "a1",
          createdAt: t1At,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "reply 1" },
          },
        },
        {
          _tag: "UserPrompt",
          id: "u2",
          createdAt: t2At,
          content: [{ type: "text", text: "second" }],
        },
        {
          _tag: "AgentUpdate",
          id: "a2",
          createdAt: t2At,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "reply 2" },
          },
        },
      ]),
      { now },
    );
    const turns = Object.values(result.turns);
    expect(turns).toHaveLength(2);
    // First turn closed when the second prompt boundary arrived.
    expect(turns[0]!.state).toBe("completed");
    // Second turn closed by the staleness heuristic (chunk is 60s old).
    expect(turns[1]!.state).toBe("completed");
  });
});
