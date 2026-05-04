import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockHandler = ((event: { data: string }) => void) | (() => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readonly url: string;
  readyState: number = 0;
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
}

function snapshotData(overrides: Record<string, unknown> = {}) {
  return {
    project: null,
    mission: null,
    milestones: [],
    goals: [],
    tasks: [],
    skills: [],
    agents: [],
    events: [],
    ...overrides,
  };
}

function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "001",
    title: "Stream task",
    description: "",
    goal: null,
    status: "todo",
    assignee: null,
    priority: 1,
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    tags: [],
    proof: null,
    retryCount: 0,
    maxRetries: 5,
    lastError: null,
    nextRetryAt: null,
    depends_on: [],
    milestone: null,
    specialty: null,
    fulfills: [],
    discoveredIssues: [],
    salientSummary: null,
    ...overrides,
  };
}

beforeEach(async () => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hostname: "localhost", protocol: "http:" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/mission")) return Promise.resolve(new Response(null, { status: 404 }));
      if (url.includes("/milestones")) return Promise.resolve(Response.json({ milestones: [] }));
      if (url.includes("/skills")) return Promise.resolve(Response.json({ skills: [] }));
      if (url.includes("/events")) return Promise.resolve(Response.json({ events: [] }));
      return Promise.resolve(
        Response.json({
          session: "alpha",
          dir: "/tmp/alpha",
          mission: null,
          goals: [],
          agents: [],
          tasks: [],
        }),
      );
    }),
  );
  // Reset the singleton wsBus between tests.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function loadHook() {
  const mod = await import("./useSessionStream");
  return mod.useSessionStream;
}

describe("useSessionStream", () => {
  it("opens the WS bus and applies snapshot frames", async () => {
    const useSessionStream = await loadHook();
    const { result, unmount } = renderHook(() => useSessionStream("alpha"));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const sock = MockWebSocket.instances[0]!;
    expect(sock.url).toContain("/ws/events");

    act(() => {
      sock.open();
      sock.message({
        type: "snapshot",
        sessionName: "alpha",
        data: snapshotData({ tasks: [buildTask({ title: "Stream task" })] }),
      });
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.snapshot?.tasks[0]?.title).toBe("Stream task");

    unmount();
  });

  it("refetches the snapshot after granular change frames", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/mission")) return Promise.resolve(new Response(null, { status: 404 }));
      if (url.includes("/milestones")) return Promise.resolve(Response.json({ milestones: [] }));
      if (url.includes("/skills")) return Promise.resolve(Response.json({ skills: [] }));
      if (url.includes("/events")) return Promise.resolve(Response.json({ events: [] }));
      return Promise.resolve(
        Response.json({
          session: "alpha",
          dir: "/tmp/alpha",
          mission: null,
          goals: [],
          agents: [],
          tasks: [buildTask({ title: "Refetched task", status: "done" })],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const useSessionStream = await loadHook();
    const { result } = renderHook(() => useSessionStream("alpha"));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const sock = MockWebSocket.instances[0]!;

    act(() => {
      sock.open();
      sock.message({ type: "snapshot", sessionName: "alpha", data: snapshotData() });
      sock.message({ type: "task.changed", sessionName: "alpha" });
    });

    await waitFor(() => expect(result.current.snapshot?.tasks[0]?.title).toBe("Refetched task"));
  });

  it("appends frames from event.appended without duplicating", async () => {
    const useSessionStream = await loadHook();
    const { result } = renderHook(() => useSessionStream("alpha"));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const sock = MockWebSocket.instances[0]!;

    act(() => {
      sock.open();
      sock.message({ type: "snapshot", sessionName: "alpha", data: snapshotData() });
    });

    const event = {
      timestamp: "2026-05-03T10:00:00Z",
      type: "completion",
      taskId: "001",
      message: "Task done",
      relative: "now",
    };

    act(() => {
      sock.message({ type: "event.appended", sessionName: "alpha", event });
      sock.message({ type: "event.appended", sessionName: "alpha", event });
    });

    expect(result.current.snapshot?.events).toHaveLength(1);
    expect(result.current.snapshot?.events[0]?.message).toBe("Task done");
  });

  it("ignores frames for other sessions", async () => {
    const useSessionStream = await loadHook();
    const { result } = renderHook(() => useSessionStream("alpha"));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const sock = MockWebSocket.instances[0]!;

    act(() => {
      sock.open();
      sock.message({ type: "snapshot", sessionName: "alpha", data: snapshotData() });
      sock.message({
        type: "snapshot",
        sessionName: "beta",
        data: snapshotData({ tasks: [buildTask({ title: "Should not leak" })] }),
      });
    });

    // Alpha got an empty snapshot; beta's snapshot must not leak in.
    expect(result.current.snapshot?.tasks).toEqual([]);
  });

  it("reconnects the underlying WS after a transport error", async () => {
    vi.useFakeTimers();
    const useSessionStream = await loadHook();
    renderHook(() => useSessionStream("alpha"));
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const first = MockWebSocket.instances[0]!;

    act(() => {
      first.open();
    });

    act(() => {
      first.errorAndClose();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]?.url).toContain("/ws/events");
  });
});
