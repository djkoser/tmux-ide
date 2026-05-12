import { afterEach, describe, expect, it, vi } from "vitest";
import { chatSessionSend } from "@/lib/api";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("chatSessionSend (T085 fix #1)", () => {
  it("POSTs to /api/v2/action/chat.session.send with the action envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { accepted: true, promptId: "p-9" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await chatSessionSend({ threadId: "t-1", text: "hello" });
    expect(out).toEqual({ accepted: true, promptId: "p-9" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v2/action/chat.session.send");
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({
      threadId: "t-1",
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("wraps text in a single text content block (T080 ProviderInstance contract)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { accepted: true, promptId: "p-1" } })),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    await chatSessionSend({ threadId: "t-2", text: "multi line\nstays one block" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.content).toHaveLength(1);
    expect(body.content[0].type).toBe("text");
    expect(body.content[0].text).toBe("multi line\nstays one block");
  });

  it("throws ProjectApiError on HTTP failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "bad request" }), { status: 400 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(chatSessionSend({ threadId: "t-3", text: "x" })).rejects.toThrow(
      /HTTP 400|bad request/,
    );
  });

  it("surfaces action-envelope errors (ok:false) as ProjectApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { message: "thread not found" } }), {
        status: 200,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(chatSessionSend({ threadId: "t-4", text: "x" })).rejects.toThrow(
      /thread not found/,
    );
  });
});
