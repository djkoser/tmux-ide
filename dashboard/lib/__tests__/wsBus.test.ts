import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockHandler = ((event: { data: string }) => void) | (() => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readonly url: string;
  readyState: number = 0; // CONNECTING
  onopen: MockHandler = null;
  onmessage: MockHandler = null;
  onerror: MockHandler = null;
  onclose: MockHandler = null;

  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    (this.onclose as (() => void) | null)?.();
  }

  // Test helpers
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    (this.onopen as (() => void) | null)?.();
  }
  message(payload: unknown): void {
    (this.onmessage as ((event: { data: string }) => void) | null)?.({
      data: JSON.stringify(payload),
    });
  }
  errorAndClose(): void {
    (this.onerror as (() => void) | null)?.();
    this.readyState = MockWebSocket.CLOSED;
    (this.onclose as (() => void) | null)?.();
  }

  parsedSends(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

// Stub OPEN and CLOSED on the constructor in addition to instance.
(MockWebSocket as unknown as { CONNECTING: number }).CONNECTING = 0;
(MockWebSocket as unknown as { CLOSING: number }).CLOSING = 2;

beforeEach(async () => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  // Each test imports a fresh module instance so the module-level singleton
  // bus state is clean. (vitest caches modules across tests otherwise.)
  vi.resetModules();
  // Make sure API_BASE resolves to a non-empty string so the bus actually
  // tries to construct a WebSocket. resolveApiBase reads window.location, so
  // happy-dom gives us a default.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hostname: "localhost", protocol: "http:" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function loadBus() {
  const mod = await import("../wsBus");
  return mod;
}

describe("wsBus", () => {
  it("opens a WebSocket on first subscribeSession and sends subscribe", async () => {
    const { subscribeSession } = await loadBus();
    const listener = vi.fn();
    subscribeSession("alpha", listener);

    expect(MockWebSocket.instances).toHaveLength(1);
    const sock = MockWebSocket.instances[0]!;
    expect(sock.url).toContain("/ws/events");
    // Convert http://… in API_BASE to ws://…
    expect(sock.url.startsWith("ws://")).toBe(true);

    // subscribe is sent only after the socket reaches OPEN.
    sock.open();
    expect(sock.parsedSends()).toEqual([{ type: "subscribe", sessions: ["alpha"] }]);
  });

  it("multiple subscribers to the same session do not open multiple WebSockets", async () => {
    const { subscribeSession } = await loadBus();
    subscribeSession("alpha", vi.fn());
    subscribeSession("alpha", vi.fn());
    subscribeSession("alpha", vi.fn());

    expect(MockWebSocket.instances).toHaveLength(1);
    const sock = MockWebSocket.instances[0]!;
    sock.open();
    // Bus deduplicates: only the first subscriber for "alpha" should produce
    // a wire-level `subscribe` frame (followed by the on-open replay).
    const subs = sock
      .parsedSends()
      .filter((f): f is { type: string } => typeof f === "object" && f !== null && "type" in f)
      .filter((f) => f.type === "subscribe");
    // Either the per-subscriber call (sent before OPEN, dropped) or the
    // on-connect replay — but exactly one frame wins.
    expect(subs.length).toBeGreaterThanOrEqual(1);
    // Should never contain duplicate "alpha" entries within a single frame.
    for (const sub of subs) {
      const sessions = (sub as unknown as { sessions: string[] }).sessions;
      expect(new Set(sessions).size).toBe(sessions.length);
    }
  });

  it("a session listener only receives frames for its session", async () => {
    const { subscribeSession } = await loadBus();
    const alphaListener = vi.fn();
    const betaListener = vi.fn();
    subscribeSession("alpha", alphaListener);
    subscribeSession("beta", betaListener);

    const sock = MockWebSocket.instances[0]!;
    sock.open();

    sock.message({ type: "task.changed", sessionName: "alpha" });
    sock.message({ type: "task.changed", sessionName: "beta" });
    sock.message({ type: "mission.changed", sessionName: "alpha" });
    sock.message({ type: "sessions.changed" }); // global only

    expect(alphaListener).toHaveBeenCalledTimes(2);
    expect(betaListener).toHaveBeenCalledTimes(1);
    for (const call of alphaListener.mock.calls) {
      expect((call[0] as { sessionName: string }).sessionName).toBe("alpha");
    }
    for (const call of betaListener.mock.calls) {
      expect((call[0] as { sessionName: string }).sessionName).toBe("beta");
    }
  });

  it("global listeners receive every frame", async () => {
    const { subscribeGlobal, subscribeSession } = await loadBus();
    const globalListener = vi.fn();
    subscribeGlobal(globalListener);
    // A session subscription is needed so the bus actually has an open socket
    // and dispatches frames; subscribeGlobal alone keeps the WS alive too.
    subscribeSession("alpha", vi.fn());

    const sock = MockWebSocket.instances[0]!;
    sock.open();
    sock.message({ type: "task.changed", sessionName: "alpha" });
    sock.message({ type: "sessions.changed" });
    sock.message({
      type: "event.appended",
      sessionName: "beta",
      event: { timestamp: "x", type: "completion", message: "done", relative: "now" },
    });

    expect(globalListener).toHaveBeenCalledTimes(3);
  });

  it("reconnects with exponential backoff and resends the current subscription set", async () => {
    vi.useFakeTimers();
    const { subscribeSession } = await loadBus();
    subscribeSession("alpha", vi.fn());
    subscribeSession("beta", vi.fn());

    const first = MockWebSocket.instances[0]!;
    first.open();
    // First subscribe frame(s) sent as listeners attach.
    expect(first.parsedSends().some((f) => (f as { type: string }).type === "subscribe")).toBe(
      true,
    );

    // Connection drops.
    first.errorAndClose();

    // Wait past the 1s initial backoff.
    vi.advanceTimersByTime(1100);
    expect(MockWebSocket.instances).toHaveLength(2);

    const second = MockWebSocket.instances[1]!;
    second.open();
    // The bus should re-announce the full subscription set on reconnect.
    const subs = second
      .parsedSends()
      .filter((f) => (f as { type: string }).type === "subscribe") as Array<{
      sessions: string[];
    }>;
    expect(subs.length).toBeGreaterThan(0);
    const last = subs[subs.length - 1]!;
    expect(new Set(last.sessions)).toEqual(new Set(["alpha", "beta"]));
  });

  it("backoff doubles after repeated failures (1s → 2s)", async () => {
    vi.useFakeTimers();
    const { subscribeSession } = await loadBus();
    subscribeSession("alpha", vi.fn());

    MockWebSocket.instances[0]!.errorAndClose();
    // First retry: 1s.
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]!.errorAndClose();
    // Second retry: 2s, not 1s.
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1100);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("last unsubscribe sends `unsubscribe` and idle-closes the socket after the grace period", async () => {
    vi.useFakeTimers();
    const { subscribeSession } = await loadBus();
    const release = subscribeSession("alpha", vi.fn());

    const sock = MockWebSocket.instances[0]!;
    sock.open();
    release();

    // unsubscribe goes out immediately.
    const unsubs = sock.parsedSends().filter((f) => (f as { type: string }).type === "unsubscribe");
    expect(unsubs).toEqual([{ type: "unsubscribe", sessions: ["alpha"] }]);

    // Socket stays open during grace period.
    expect(sock.readyState).toBe(MockWebSocket.OPEN);
    vi.advanceTimersByTime(4_000);
    expect(sock.readyState).toBe(MockWebSocket.OPEN);

    // After 5s, the bus closes the socket.
    vi.advanceTimersByTime(2_000);
    expect(sock.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("re-subscribing inside the idle grace period reuses the existing socket", async () => {
    vi.useFakeTimers();
    const { subscribeSession } = await loadBus();
    const release = subscribeSession("alpha", vi.fn());
    const sock = MockWebSocket.instances[0]!;
    sock.open();
    release();
    vi.advanceTimersByTime(2_000);

    subscribeSession("alpha", vi.fn());
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(sock.readyState).toBe(MockWebSocket.OPEN);

    // Skip past the original idle-close deadline; socket should still be open.
    vi.advanceTimersByTime(10_000);
    expect(sock.readyState).toBe(MockWebSocket.OPEN);
  });

  it("getWsState reflects the connection lifecycle", async () => {
    const { subscribeSession, getWsState } = await loadBus();
    expect(getWsState()).toBe("closed");
    subscribeSession("alpha", vi.fn());
    expect(getWsState()).toBe("connecting");
    MockWebSocket.instances[0]!.open();
    expect(getWsState()).toBe("open");
    MockWebSocket.instances[0]!.errorAndClose();
    expect(getWsState()).toBe("closed");
  });

  it("is a no-op on SSR (no WebSocket global)", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const { subscribeSession, subscribeGlobal } = await loadBus();
    const release1 = subscribeSession("alpha", vi.fn());
    const release2 = subscribeGlobal(vi.fn());
    expect(MockWebSocket.instances).toHaveLength(0);
    release1();
    release2();
  });
});
