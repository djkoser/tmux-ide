import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../src";

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  messageListenerCount = 0;

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close = vi.fn();
  send = vi.fn();

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "message") this.messageListenerCount += 1;
    super.addEventListener(type, callback, options);
  }
}

function ok(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(assertion()).toBe(true);
}

describe("PermissionDialog", () => {
  const originalFetch = globalThis.fetch;
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    document.body.innerHTML = "";
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = OriginalWebSocket;
    document.body.innerHTML = "";
  });

  it("responds with the selected option and closes optimistically", async () => {
    const actionBodies: unknown[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      const url = String(_url);
      if (url.includes("chat.permission.respond")) {
        actionBodies.push(JSON.parse(String(init?.body)));
        return ok({ responded: true });
      }
      return ok({
        thread: {
          id: "thread-1",
          title: "New chat",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          provider: { kind: "claude-code" },
          messages: [],
        },
      });
    }) as typeof fetch;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const handle = mount(container, {
      threadId: "thread-1",
      sessionName: "alpha",
      apiBaseUrl: "http://127.0.0.1:6060",
      wsUrl: "ws://127.0.0.1:6060/ws/events",
      bearerToken: null,
    });

    await waitFor(() => (FakeWebSocket.instances[0]?.messageListenerCount ?? 0) > 0);
    await waitFor(() => container.textContent?.includes("New chat") ?? false);
    FakeWebSocket.instances[0]?.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "chat.permission.request",
          threadId: "thread-1",
          requestId: "request-1",
          toolCall: { toolCallId: "tool-1", title: "Edit file", kind: "edit" },
          options: [
            { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
            { optionId: "reject_once", name: "Reject once", kind: "reject_once" },
          ],
        }),
      }),
    );

    await waitFor(() => container.textContent?.includes("Permission required") ?? false);
    container
      .querySelector<HTMLButtonElement>("[data-option-kind^='allow']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => !(container.textContent?.includes("Permission required") ?? false));
    expect(actionBodies).toEqual([
      { threadId: "thread-1", requestId: "request-1", optionId: "allow_once" },
    ]);

    handle.unmount();
  });
});
