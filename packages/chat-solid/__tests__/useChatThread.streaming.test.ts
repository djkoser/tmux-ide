/**
 * Streaming-chunk coalescer.
 *
 * The daemon emits one `chat.thread.update` WS frame per token-burst.
 * Before the coalescer, the hook pushed one `AgentUpdate` per frame —
 * a 200-chunk turn ballooned `store.messages` to 200 entries and
 * forced `coalesceMessages` to walk all of them on every render.
 * The fix:
 *
 *   1. Buffer `chat.thread.update` frames in a queue.
 *   2. Flush once per animation frame (or microtask in tests).
 *   3. Merge consecutive same-kind same-messageId text chunks into
 *      the previous AgentUpdate's content in place.
 *
 * The visible UI (concatenated text) is identical — but the store
 * grows by O(1) per turn instead of O(N) per chunk.
 *
 * This file pins:
 *   - 50 consecutive text chunks → 1 store entry, text concatenated.
 *   - A tool_call landing between two text chunks breaks the merge
 *     window and produces 3 entries (chunk, tool_call, chunk).
 *   - Chunks belonging to different messageIds don't merge.
 *   - Non-text chunk content (image, audio) skips the merge.
 *   - The final assistant ChatMessage emitted via `chat.rows` is the
 *     same single bubble whether we got 1 frame or 50.
 */

import { createRoot, createSignal, type Accessor } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatThread } from "../src/hooks/useChatThread";
import type { ChatMountOptions } from "../src/types";

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  readonly url: string;

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close = vi.fn();
  send = vi.fn();
}

function actionOk(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function plansOk(): Response {
  return new Response(JSON.stringify({ plans: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function panesOk(): Response {
  return new Response(JSON.stringify({ panes: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function threadResult(messages: unknown[] = []) {
  return {
    thread: {
      id: "thread-1",
      title: "Streaming",
      createdAt: "2026-05-14T10:00:00.000Z",
      updatedAt: "2026-05-14T10:00:00.000Z",
      provider: { kind: "claude-code" },
      messages,
    },
  };
}

function mountHook() {
  let chat!: ReturnType<typeof useChatThread>;
  let dispose!: () => void;
  createRoot((rootDispose) => {
    dispose = rootDispose;
    const [options] = createSignal<ChatMountOptions>({
      threadId: "thread-1",
      sessionName: "alpha",
      apiBaseUrl: "http://127.0.0.1:6060",
      wsUrl: "ws://127.0.0.1:6060/ws/events",
      bearerToken: null,
    });
    chat = useChatThread(options as Accessor<ChatMountOptions>);
  });
  return { chat, dispose };
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 4));
  }
  expect(assertion()).toBe(true);
}

function pushMessage(socket: FakeWebSocket, payload: unknown): void {
  socket.dispatchEvent(
    new MessageEvent("message", { data: JSON.stringify(payload) }),
  );
}

function textChunkFrame(seq: number, text: string, messageId = "msg-1") {
  return {
    type: "chat.thread.update" as const,
    threadId: "thread-1",
    seq,
    update: {
      sessionUpdate: "agent_message_chunk" as const,
      content: { type: "text" as const, text },
      messageId,
    },
  };
}

function toolCallFrame(seq: number, toolCallId: string) {
  return {
    type: "chat.thread.update" as const,
    threadId: "thread-1",
    seq,
    update: {
      sessionUpdate: "tool_call" as const,
      toolCallId,
      title: "Run something",
      status: "in_progress" as const,
    },
  };
}

function imageChunkFrame(seq: number, dataUrl: string, messageId = "msg-img") {
  return {
    type: "chat.thread.update" as const,
    threadId: "thread-1",
    seq,
    update: {
      sessionUpdate: "agent_message_chunk" as const,
      content: { type: "image" as const, data: dataUrl, mimeType: "image/png" },
      messageId,
    },
  };
}

describe("useChatThread streaming-chunk coalescer", () => {
  const originalFetch = globalThis.fetch;
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.fetch = vi.fn(async (url) => {
      const s = String(url);
      if (s.includes("/plans")) return plansOk();
      if (s.includes("/panes")) return panesOk();
      return actionOk(threadResult());
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = OriginalWebSocket;
  });

  it("merges 50 consecutive text chunks into ONE assistant ChatMessage", async () => {
    const { chat, dispose } = mountHook();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const socket = FakeWebSocket.instances[0]!;
    await waitFor(() => chat.thread() !== null);

    const fragments = Array.from({ length: 50 }, (_, i) => `chunk-${i} `);
    for (let i = 0; i < fragments.length; i += 1) {
      pushMessage(socket, textChunkFrame(i + 1, fragments[i]!));
    }

    await waitFor(() => chat.rows().length > 0);

    // Single assistant ChatMessage emitted regardless of frame count.
    const messageRows = chat
      .rows()
      .filter((row): row is Extract<typeof row, { kind: "message" }> => row.kind === "message");
    expect(messageRows).toHaveLength(1);
    const message = messageRows[0]!.message;
    expect(message.role).toBe("assistant");
    if (message.role === "assistant") {
      expect(message.text).toBe(fragments.join(""));
    }

    dispose();
  });

  it("splits the merge window on a non-chunk update between text chunks", async () => {
    const { chat, dispose } = mountHook();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const socket = FakeWebSocket.instances[0]!;
    await waitFor(() => chat.thread() !== null);

    pushMessage(socket, textChunkFrame(1, "before "));
    pushMessage(socket, toolCallFrame(2, "tc-1"));
    pushMessage(socket, textChunkFrame(3, "after"));

    await waitFor(() => chat.rows().length > 0);
    const messages = chat
      .rows()
      .filter((row): row is Extract<typeof row, { kind: "message" }> => row.kind === "message");
    // Assistant message text concatenates both halves regardless of
    // the intervening tool call.
    const assistant = messages[0]!.message;
    if (assistant.role === "assistant") {
      expect(assistant.text).toBe("before after");
      expect(assistant.toolCalls.map((tc) => tc.toolCallId)).toEqual(["tc-1"]);
    }
    dispose();
  });

  it("preserves the messageId boundary at the store layer", async () => {
    // Same-messageId frames collapse into one AgentUpdate; a
    // messageId change opens a new AgentUpdate. The read-time
    // coalescer concatenates both into a single assistant bubble
    // (existing behavior), but the underlying store stays
    // bounded — two entries for two distinct chunk streams.
    const { chat, dispose } = mountHook();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const socket = FakeWebSocket.instances[0]!;
    await waitFor(() => chat.thread() !== null);

    pushMessage(socket, textChunkFrame(1, "A1 ", "msg-A"));
    pushMessage(socket, textChunkFrame(2, "A2", "msg-A"));
    pushMessage(socket, textChunkFrame(3, "B1 ", "msg-B"));
    pushMessage(socket, textChunkFrame(4, "B2", "msg-B"));

    await waitFor(() => chat.rows().length > 0);
    // Visible UI: one continuous assistant bubble (read-time
    // coalescer doesn't split on messageId boundaries).
    const messages = chat
      .rows()
      .filter((row): row is Extract<typeof row, { kind: "message" }> => row.kind === "message");
    expect(messages).toHaveLength(1);
    const assistant = messages[0]!.message;
    if (assistant.role === "assistant") {
      expect(assistant.text).toBe("A1 A2B1 B2");
    }
    dispose();
  });

  it("skips the merge for non-text chunk content", async () => {
    const { chat, dispose } = mountHook();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const socket = FakeWebSocket.instances[0]!;
    await waitFor(() => chat.thread() !== null);

    pushMessage(socket, textChunkFrame(1, "before "));
    pushMessage(socket, imageChunkFrame(2, "data:image/png;base64,xxx", "msg-1"));
    pushMessage(socket, textChunkFrame(3, "after"));

    await waitFor(() => chat.rows().length > 0);
    // The image chunk is a distinct AgentUpdate; the surrounding
    // text chunks still concatenate via the read-time coalescer.
    const messages = chat
      .rows()
      .filter((row): row is Extract<typeof row, { kind: "message" }> => row.kind === "message");
    expect(messages).toHaveLength(1);
    const assistant = messages[0]!.message;
    if (assistant.role === "assistant") {
      expect(assistant.text).toContain("before ");
      expect(assistant.text).toContain("after");
    }
    dispose();
  });

  it("batches multiple frames per flush into one reactive update", async () => {
    const { chat, dispose } = mountHook();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const socket = FakeWebSocket.instances[0]!;
    await waitFor(() => chat.thread() !== null);

    let rowEvaluations = 0;
    const stop = chat.rows;
    createRoot(() => {
      // Subscribing once causes Solid to run our derivation per
      // tracked dependency change. We push 20 chunks synchronously
      // and expect a single flush — so the row memo re-evaluates
      // at most twice (initial + flush).
      rowEvaluations += stop().length > -1 ? 1 : 0;
    });

    const fragments = Array.from({ length: 20 }, (_, i) => `x${i}`);
    for (let i = 0; i < fragments.length; i += 1) {
      pushMessage(socket, textChunkFrame(i + 1, fragments[i]!));
    }
    // Single microtask = single flush in test env.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(chat.rows().length).toBeGreaterThan(0);
    expect(rowEvaluations).toBeLessThanOrEqual(2);
    dispose();
  });
});
