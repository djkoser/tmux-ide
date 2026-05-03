import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStream, type SessionSnapshot } from "./useSessionStream";

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as (event: MessageEvent<string>) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as (event: MessageEvent<string>) => void);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.();
  }

  error(): void {
    this.onerror?.();
  }

  emit(type: string, payload: unknown): void {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
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

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSessionStream", () => {
  it("opens the project stream and applies snapshot events", () => {
    const { result, unmount } = renderHook(() => useSessionStream("alpha"));
    const source = MockEventSource.instances[0]!;

    expect(source.url).toContain("/api/project/alpha/stream");

    act(() => {
      source.open();
      source.emit(
        "snapshot",
        snapshot({
          tasks: [
            {
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
            },
          ],
        }),
      );
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.snapshot?.tasks[0]?.title).toBe("Stream task");

    unmount();
    expect(source.closed).toBe(true);
  });

  it("refetches the snapshot after granular change events", async () => {
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
          tasks: [
            {
              id: "001",
              title: "Refetched task",
              description: "",
              goal: null,
              status: "done",
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
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSessionStream("alpha"));
    const source = MockEventSource.instances[0]!;

    act(() => {
      source.emit("snapshot", snapshot());
      source.emit("task.changed", { id: "001", op: "update" });
    });

    await waitFor(() => expect(result.current.snapshot?.tasks[0]?.title).toBe("Refetched task"));
  });

  it("reconnects with backoff after stream errors", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionStream("alpha"));
    const source = MockEventSource.instances[0]!;

    act(() => {
      source.open();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      source.error();
    });
    expect(result.current.connected).toBe(false);
    expect(source.closed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1]?.url).toContain("/api/project/alpha/stream");
  });
});
