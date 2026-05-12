import { describe, expect, it } from "vitest";
import { coalesceMessages } from "../src/coalesce";
import type { ThreadMessage } from "../src/types";

function user(id: string, text: string): ThreadMessage {
  return {
    _tag: "UserPrompt",
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    content: [{ type: "text", text }],
  };
}

function update(
  id: string,
  update: Extract<ThreadMessage, { _tag: "AgentUpdate" }>["update"],
): ThreadMessage {
  return {
    _tag: "AgentUpdate",
    id,
    createdAt: "2026-01-01T00:00:01.000Z",
    update,
  };
}

describe("coalesceMessages", () => {
  it("coalesces streamed text chunks into one assistant row", () => {
    const rows = coalesceMessages([
      user("prompt-1", "hello"),
      update("a1", {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hey" },
      }),
      update("a2", { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "! " } }),
      update("a3", {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "How can I help?" },
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      kind: "message",
      message: { role: "assistant", text: "Hey! How can I help?" },
    });
  });

  it("merges tool call updates by id and keeps turn boundaries", () => {
    const rows = coalesceMessages([
      user("prompt-1", "inspect"),
      update("a1", {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Checking. " },
      }),
      update("tool-1", {
        sessionUpdate: "tool_call",
        toolCallId: "A",
        title: "Read package.json",
        kind: "read",
        status: "in_progress",
      }),
      update("tool-2", {
        sessionUpdate: "tool_call_update",
        toolCallId: "A",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "done" } }],
      }),
      user("prompt-2", "again"),
      update("b1", {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Second turn." },
      }),
    ]);

    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({
      kind: "message",
      message: {
        role: "assistant",
        text: "Checking. ",
        toolCalls: [{ toolCallId: "A", status: "completed", content: expect.any(Array) }],
      },
    });
    expect(rows[3]).toMatchObject({
      kind: "message",
      message: { role: "assistant", text: "Second turn." },
    });
  });

  it("renders plans as separate rows and replaces later plans in the same turn", () => {
    const rows = coalesceMessages([
      user("prompt-1", "plan"),
      update("plan-1", {
        sessionUpdate: "plan",
        entries: [{ content: "First", status: "pending" }],
      }),
      update("plan-2", {
        sessionUpdate: "plan",
        entries: [{ content: "Second", status: "in_progress" }],
      }),
    ]);

    expect(rows[2]).toEqual({
      kind: "plan",
      id: "plan:plan-1",
      createdAt: "2026-01-01T00:00:01.000Z",
      entries: [{ content: "Second", status: "in_progress" }],
    });
  });

  it("does not render available commands as timeline rows", () => {
    const rows = coalesceMessages([
      user("prompt-1", "commands"),
      update("commands", {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "/help", description: "Show help" }],
      }),
    ]);

    expect(rows).toHaveLength(2);
  });

  it("keeps thought chunks separate from assistant text", () => {
    const rows = coalesceMessages([
      user("prompt-1", "think"),
      update("thought-1", {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Considering " },
      }),
      update("thought-2", {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "options." },
      }),
    ]);

    expect(rows[1]).toMatchObject({
      kind: "message",
      message: { role: "assistant", text: "", thoughtText: "Considering options." },
    });
  });
});
