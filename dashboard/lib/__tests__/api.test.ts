import { describe, it, expect, vi, beforeEach } from "vitest";
import { marksToSections } from "../api";
import { makeMark } from "./support";

describe("marksToSections", () => {
  it("returns empty object for empty marks", () => {
    const result = marksToSections({}, "# Heading\nSome text");
    expect(result).toEqual({});
  });

  it("attributes a section to the mark author", () => {
    const content = "# Introduction\nSome intro text here";
    const marks: Record<string, Mark> = {
      m1: makeMark({
        by: "ai:Claude",
        range: { from: 0, to: content.length },
        at: "2026-03-21T10:00:00Z",
      }),
    };

    const result = marksToSections(marks, content);
    expect(result["Introduction"]).toBeDefined();
    expect(result["Introduction"]!.author).toBe("ai:Claude");
    expect(result["Introduction"]!.charCount).toBeGreaterThan(0);
  });

  it("picks dominant author when multiple authors contribute", () => {
    const content =
      "# Design\nShort bit by human. And then a much longer section written entirely by AI that has many more characters.";
    const marks: Record<string, Mark> = {
      m1: makeMark({
        id: "m1",
        by: "human:thijs",
        range: { from: 9, to: 30 },
        at: "2026-03-21T10:00:00Z",
      }),
      m2: makeMark({
        id: "m2",
        by: "ai:Claude",
        range: { from: 30, to: content.length },
        at: "2026-03-21T10:05:00Z",
      }),
    };

    const result = marksToSections(marks, content);
    expect(result["Design"]!.author).toBe("ai:Claude");
  });

  it("handles multiple sections independently", () => {
    const content = "# Section A\nText A\n# Section B\nText B";
    const sectionAEnd = content.indexOf("# Section B");
    const marks: Record<string, Mark> = {
      m1: makeMark({
        id: "m1",
        by: "human:thijs",
        range: { from: 0, to: sectionAEnd },
        at: "2026-03-21T10:00:00Z",
      }),
      m2: makeMark({
        id: "m2",
        by: "ai:Claude",
        range: { from: sectionAEnd, to: content.length },
        at: "2026-03-21T10:05:00Z",
      }),
    };

    const result = marksToSections(marks, content);
    expect(result["Section A"]!.author).toBe("human:thijs");
    expect(result["Section B"]!.author).toBe("ai:Claude");
  });

  it("skips orphaned marks", () => {
    const content = "# Heading\nSome text";
    const marks: Record<string, Mark> = {
      m1: makeMark({
        by: "ai:Claude",
        range: { from: 0, to: content.length },
        orphaned: true,
      }),
    };

    const result = marksToSections(marks, content);
    expect(result).toEqual({});
  });
});

describe("fetchPlan", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("transforms marks + stats into authorship data", async () => {
    const mockResponse = {
      name: "test-plan",
      content: "# Plan\nContent here",
      marks: {
        m1: makeMark({
          by: "ai:Claude",
          range: { from: 0, to: 20 },
        }),
      },
      stats: { aiPercent: 100, humanPercent: 0, totalChars: 20 },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { fetchPlan } = await import("../api");
    const result = await fetchPlan("session", "test-plan");

    expect(result.content).toBe("# Plan\nContent here");
    expect(result.authorship).not.toBeNull();
    expect(result.authorship!.stats.aiPercent).toBe(100);
    expect(result.authorship!.sections["Plan"]).toBeDefined();
  });

  it("returns null authorship when marks are null", async () => {
    const mockResponse = {
      name: "test-plan",
      content: "# Plan\nNo marks",
      marks: null,
      stats: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { fetchPlan } = await import("../api");
    const result = await fetchPlan("session", "test-plan");

    expect(result.content).toBe("# Plan\nNo marks");
    expect(result.authorship).toBeNull();
  });
});

describe("updateTask", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Task object on success", async () => {
    const mockTask = {
      id: "001",
      title: "Test",
      status: "in-progress",
      assignee: "Claude",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, task: mockTask }),
      }),
    );

    const { updateTask } = await import("../api");
    const result = await updateTask("session", "001", { status: "in-progress" });

    expect(result).not.toBeNull();
    expect(result!.id).toBe("001");
    expect(result!.status).toBe("in-progress");
  });

  it("returns null on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const { updateTask } = await import("../api");
    const result = await updateTask("session", "001", { status: "done" });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Chat thread/provider client (talks to /api/threads + /api/chat/providers)
// ---------------------------------------------------------------------------

describe("chatThreadList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps the daemon's { threads } envelope and returns it as-is", async () => {
    const threads = [
      { id: "t1", title: "First", providerKind: "claude-code" },
      { id: "t2", title: "Second", providerKind: "codex" },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ threads }) });
    vi.stubGlobal("fetch", fetchMock);

    const { chatThreadList } = await import("../api");
    const result = await chatThreadList();

    expect(result.threads).toEqual(threads);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/threads$/),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("throws ProjectApiError on non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "boom" }),
      }),
    );

    const { chatThreadList, ProjectApiError } = await import("../api");
    await expect(chatThreadList()).rejects.toBeInstanceOf(ProjectApiError);
  });
});

describe("chatThreadCreate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the provider+title body and returns { thread, state }", async () => {
    const thread = { id: "t1", title: "New chat", providerKind: "claude-code" };
    const state = { id: "t1", title: "New chat", provider: { kind: "claude-code" }, messages: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ thread, state }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { chatThreadCreate } = await import("../api");
    const result = await chatThreadCreate({
      provider: { kind: "claude-code" },
      title: "New chat",
    });

    expect(result.thread).toEqual(thread);
    expect(result.state).toEqual(state);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/threads$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      provider: { kind: "claude-code" },
      title: "New chat",
    });
  });

  it("throws ProjectApiError on validation failure (HTTP 400)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Invalid provider" }),
      }),
    );

    const { chatThreadCreate, ProjectApiError } = await import("../api");
    await expect(chatThreadCreate({ provider: { kind: "claude-code" } })).rejects.toBeInstanceOf(
      ProjectApiError,
    );
  });
});

describe("chatThreadDelete", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("issues DELETE /api/threads/:id and resolves to void on 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ deleted: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const { chatThreadDelete } = await import("../api");
    await chatThreadDelete({ id: "t-abc/with slash" });

    const [url, init] = fetchMock.mock.calls[0];
    // The id must be URL-encoded so a "/" in a thread id doesn't change the route.
    expect(url).toMatch(/\/api\/threads\/t-abc%2Fwith%20slash$/);
    expect(init.method).toBe("DELETE");
  });

  it("throws ProjectApiError when the thread does not exist (HTTP 404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Thread missing not found" }),
      }),
    );

    const { chatThreadDelete, ProjectApiError } = await import("../api");
    await expect(chatThreadDelete({ id: "missing" })).rejects.toBeInstanceOf(ProjectApiError);
  });
});

describe("chatProvidersList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { providers } from /api/chat/providers", async () => {
    const providers = [
      {
        kind: "claude-code",
        name: "Claude Code",
        description: "...",
        available: true,
        binary: "/usr/local/bin/claude",
        version: "1.2.3",
      },
      {
        kind: "codex",
        name: "Codex",
        description: "...",
        available: false,
        error: "not found on PATH",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ providers }) });
    vi.stubGlobal("fetch", fetchMock);

    const { chatProvidersList } = await import("../api");
    const result = await chatProvidersList();

    expect(result.providers).toEqual(providers);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/chat\/providers$/);
  });

  it("normalizes a missing providers field to an empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    );

    const { chatProvidersList } = await import("../api");
    const result = await chatProvidersList();
    expect(result.providers).toEqual([]);
  });
});
