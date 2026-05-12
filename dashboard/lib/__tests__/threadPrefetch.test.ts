import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import type { ThreadIndexEntry, ThreadState } from "@/components/chat-v2/types";

// Mock chatThreadGet BEFORE importing the prefetch module so the spy is
// in place for every test. Vitest hoists `vi.mock` so the order in source
// doesn't matter, but the factory closure captures the spy.
const chatThreadGetSpy = vi.fn<(threadId: string) => Promise<ThreadState | null>>();
vi.mock("@/lib/api", () => ({
  chatThreadGet: (id: string) => chatThreadGetSpy(id),
}));

import {
  __resetThreadPrefetchForTests,
  __triggerVisibilityChangeForTests,
  bootstrapPrefetchFromList,
  getCached,
  getOrFetchThread,
  STALE_MS,
  usePreloadedThread,
  useThreadPrefetchStore,
} from "../threadPrefetch";

function threadState(id: string, updatedAt: string): ThreadState {
  return {
    id,
    title: `thread-${id}`,
    provider: "claude-code",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt,
    messages: [],
    sessions: [],
    sessionState: {},
  } as unknown as ThreadState;
}

function indexEntry(id: string, updatedAt: string): ThreadIndexEntry {
  return {
    id,
    title: `thread-${id}`,
    provider: "claude-code",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt,
  } as unknown as ThreadIndexEntry;
}

beforeEach(() => {
  __resetThreadPrefetchForTests();
  chatThreadGetSpy.mockReset();
});

afterEach(() => {
  __resetThreadPrefetchForTests();
});

describe("bootstrapPrefetchFromList", () => {
  it("fetches the top-N most-recently-updated threads", async () => {
    chatThreadGetSpy.mockImplementation((id) =>
      Promise.resolve(threadState(id, "2026-02-09T00:00:00.000Z")),
    );

    const threads: ThreadIndexEntry[] = [
      indexEntry("old", "2026-02-01T00:00:00.000Z"),
      indexEntry("new", "2026-02-09T00:00:00.000Z"),
      indexEntry("mid", "2026-02-05T00:00:00.000Z"),
      indexEntry("ancient", "2026-01-01T00:00:00.000Z"),
    ];

    await bootstrapPrefetchFromList(threads, { topN: 2 });

    // Top-2 by updatedAt: "new" + "mid".
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(2);
    expect(chatThreadGetSpy.mock.calls.map((c) => c[0]).sort()).toEqual(["mid", "new"]);
    expect(getCached("new")?.state?.id).toBe("new");
    expect(getCached("mid")?.state?.id).toBe("mid");
    expect(getCached("old")).toBeUndefined();
  });

  it("does not reject when a per-thread fetch fails", async () => {
    chatThreadGetSpy.mockImplementation((id) =>
      id === "boom"
        ? Promise.reject(new Error("HTTP 500"))
        : Promise.resolve(threadState(id, "2026-02-09T00:00:00.000Z")),
    );

    const threads: ThreadIndexEntry[] = [
      indexEntry("boom", "2026-02-09T00:00:00.000Z"),
      indexEntry("ok", "2026-02-08T00:00:00.000Z"),
    ];

    await expect(bootstrapPrefetchFromList(threads, { topN: 2 })).resolves.toBeUndefined();
    expect(getCached("boom")?.error?.message).toBe("HTTP 500");
    expect(getCached("ok")?.state?.id).toBe("ok");
  });
});

describe("getOrFetchThread", () => {
  it("returns the cached state without re-fetching when warm", async () => {
    chatThreadGetSpy.mockResolvedValueOnce(threadState("t1", "2026-02-09T00:00:00.000Z"));
    await getOrFetchThread("t1");
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);

    chatThreadGetSpy.mockResolvedValueOnce(null);
    const second = await getOrFetchThread("t1");
    // No new fetch — the cached value is returned.
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);
    expect(second?.id).toBe("t1");
  });

  it("falls back to chatThreadGet on cache miss", async () => {
    chatThreadGetSpy.mockResolvedValueOnce(threadState("fresh", "2026-02-09T00:00:00.000Z"));
    const state = await getOrFetchThread("fresh");
    expect(chatThreadGetSpy).toHaveBeenCalledWith("fresh");
    expect(state?.id).toBe("fresh");
    expect(getCached("fresh")?.state?.id).toBe("fresh");
  });

  it("dedupes concurrent fetches for the same thread", async () => {
    let resolveFn: ((s: ThreadState | null) => void) | null = null;
    chatThreadGetSpy.mockImplementation(
      () => new Promise<ThreadState | null>((r) => (resolveFn = r)),
    );

    const p1 = getOrFetchThread("dedup");
    const p2 = getOrFetchThread("dedup");
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);
    resolveFn?.(threadState("dedup", "2026-02-09T00:00:00.000Z"));
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates errors and stores them in the cache", async () => {
    chatThreadGetSpy.mockRejectedValueOnce(new Error("offline"));
    await expect(getOrFetchThread("err")).rejects.toThrow("offline");
    expect(getCached("err")?.error?.message).toBe("offline");
  });
});

describe("usePreloadedThread", () => {
  it("returns cached state synchronously on warm hit", async () => {
    chatThreadGetSpy.mockResolvedValueOnce(threadState("warm", "2026-02-09T00:00:00.000Z"));
    await getOrFetchThread("warm");

    chatThreadGetSpy.mockClear();
    const { result } = renderHook(() => usePreloadedThread("warm"));
    // No fetch fired — the entry was already present.
    expect(chatThreadGetSpy).not.toHaveBeenCalled();
    expect(result.current.state?.id).toBe("warm");
    expect(result.current.warm).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("kicks off a fetch on miss and transitions loading → state", async () => {
    chatThreadGetSpy.mockResolvedValueOnce(threadState("cold", "2026-02-09T00:00:00.000Z"));
    const { result } = renderHook(() => usePreloadedThread("cold"));
    expect(result.current.warm).toBe(false);
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.state?.id).toBe("cold");
    });
    expect(result.current.loading).toBe(false);
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null state without fetching when threadId is null", () => {
    const { result } = renderHook(() => usePreloadedThread(null));
    expect(result.current.state).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(chatThreadGetSpy).not.toHaveBeenCalled();
  });
});

describe("visibility-change refresh", () => {
  it("refetches stale entries when the tab becomes visible", async () => {
    chatThreadGetSpy.mockResolvedValueOnce(threadState("stale", "2026-02-01T00:00:00.000Z"));
    await getOrFetchThread("stale");
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);

    // Mount the hook so the visibility listener gets installed.
    renderHook(() => usePreloadedThread("stale"));

    // Backdate the fetchedAt past the stale threshold.
    useThreadPrefetchStore.setState((s) => ({
      cache: {
        ...s.cache,
        stale: {
          state: s.cache.stale.state,
          fetchedAt: Date.now() - STALE_MS - 1_000,
          error: null,
        },
      },
    }));

    chatThreadGetSpy.mockResolvedValueOnce(threadState("stale", "2026-02-09T00:00:00.000Z"));
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    __triggerVisibilityChangeForTests();

    await waitFor(() => {
      expect(chatThreadGetSpy).toHaveBeenCalledTimes(2);
    });
    // Cache updates to the new value.
    expect(getCached("stale")?.state?.updatedAt).toBe("2026-02-09T00:00:00.000Z");
  });

  it("does NOT refetch entries fresher than STALE_MS", async () => {
    chatThreadGetSpy.mockResolvedValueOnce(threadState("fresh", "2026-02-09T00:00:00.000Z"));
    await getOrFetchThread("fresh");

    renderHook(() => usePreloadedThread("fresh"));

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    __triggerVisibilityChangeForTests();

    // One tick to let any background fetch fire — none should.
    await new Promise((r) => setTimeout(r, 0));
    expect(chatThreadGetSpy).toHaveBeenCalledTimes(1);
  });
});
