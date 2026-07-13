import { describe, it, expect, vi, beforeEach } from "vitest";
import { marksToSections } from "../api";
import { makeMark } from "./support";
import type { Mark } from "../types";

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

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task.id).toBe("001");
      expect(result.task.status).toBe("in-progress");
    }
  });

  it("surfaces the refusal reason on a 409 (no silent no-op)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Only the validator/reviewer may mark a task done" }),
      }),
    );

    const { updateTask } = await import("../api");
    const result = await updateTask("session", "001", { status: "done" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("validator/reviewer");
  });
});

describe("createTask (create-only fields + guards)", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns the task on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, task: { id: "005", title: "T" } }),
      }),
    );
    const { createTask } = await import("../api");
    const result = await createTask("s", { title: "T", fulfills: ["VAL-A"], milestone: "M1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.task.id).toBe("005");
  });

  it("surfaces the 409 guard detail (unknown assertion)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Unknown assertion(s) in fulfills",
          unknownAssertions: ["VAL-X"],
        }),
      }),
    );
    const { createTask } = await import("../api");
    const result = await createTask("s", { title: "T", fulfills: ["VAL-X"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("VAL-X");
  });
});

describe("sendToTargets + fetchSendBatch", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns batchId + seeded recipients on 202", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({
          ok: true,
          batchId: "abc123",
          fanOut: true,
          recipients: [
            {
              paneId: "%1",
              name: "cw1",
              title: "cw1",
              role: "teammate",
              status: "retrying",
              attempts: 0,
            },
          ],
        }),
      }),
    );
    const { sendToTargets } = await import("../api");
    const result = await sendToTargets("s", { target: "cw*", message: "hi" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.batch.batchId).toBe("abc123");
      expect(result.batch.recipients[0]!.status).toBe("retrying");
    }
  });

  it("surfaces error + available panes on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: "Pane not found",
          available: [{ title: "lead", name: "lead" }],
        }),
      }),
    );
    const { sendToTargets } = await import("../api");
    const result = await sendToTargets("s", { target: "ghost", message: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.available?.[0]!.name).toBe("lead");
  });

  it("parses per-recipient status from the batch poll", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          batchId: "abc123",
          done: true,
          ok: false,
          recipients: [
            {
              paneId: "%1",
              name: "cw1",
              title: "cw1",
              role: "teammate",
              status: "delivered",
              attempts: 1,
            },
            {
              paneId: "%2",
              name: "cw2",
              title: "cw2",
              role: "teammate",
              status: "failed",
              attempts: 4,
            },
          ],
        }),
      }),
    );
    const { fetchSendBatch } = await import("../api");
    const batch = await fetchSendBatch("s", "abc123");
    expect(batch?.done).toBe(true);
    expect(batch?.ok).toBe(false);
    expect(batch?.recipients.find((r) => r.paneId === "%2")?.status).toBe("failed");
  });
});

describe("milestone + contract clients", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("insertMilestone posts to the insert route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const { insertMilestone } = await import("../api");
    const r = await insertMilestone("s", { title: "X", position: 2 });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toContain("/milestones/insert");
  });

  it("saveContract surfaces the 409 stillClaimed detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Cannot drop assertion(s) still claimed by a task's fulfills",
          stillClaimed: { "VAL-B": ["001"] },
        }),
      }),
    );
    const { saveContract } = await import("../api");
    const r = await saveContract("s", "- **VAL-A** a\n");
    expect(r.ok).toBe(false);
    expect(r.stillClaimed?.["VAL-B"]).toEqual(["001"]);
  });
});

describe("federated workspaces", () => {
  beforeEach(() => vi.unstubAllGlobals());

  const alpha = {
    name: "alpha",
    path: "/w/alpha",
    session: "w-alpha",
    ports: { commandCenter: 6061 },
  };
  const beta = { name: "beta", path: "/w/beta", session: "w-beta", ports: { commandCenter: 6062 } };
  const alphaDetail = {
    session: "w-alpha",
    mission: { title: "Alpha mission", status: "active" },
    tasks: [
      { id: "001", status: "done" },
      { id: "002", status: "todo" },
    ],
    milestones: [{ id: "M1", status: "done", order: 1 }],
    validationSummary: { total: 3, passing: 2, failing: 0, pending: 1, blocked: 0 },
  };

  it("fetchWorkspaces returns the registry list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: 1, workspaces: [alpha] }),
      }),
    );
    const { fetchWorkspaces } = await import("../api");
    const list = await fetchWorkspaces();
    expect(list.map((w) => w.name)).toEqual(["alpha"]);
  });

  it("aggregates two workspaces with one daemon down — offline never blocks the other", async () => {
    const fetchMock = vi.fn((url: string, _opts?: unknown) => {
      const u = String(url);
      if (u.endsWith("/api/workspaces"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ version: 1, workspaces: [alpha, beta] }),
        });
      if (u === "http://127.0.0.1:6061/health") return Promise.resolve({ ok: true });
      if (u === "http://127.0.0.1:6061/api/project/w-alpha")
        return Promise.resolve({ ok: true, json: async () => alphaDetail });
      // beta daemon down — connection refused
      if (u.startsWith("http://127.0.0.1:6062")) return Promise.reject(new Error("ECONNREFUSED"));
      return Promise.resolve({ ok: false, status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { aggregateWorkspaces } = await import("../api");
    const sums = await aggregateWorkspaces();
    expect(sums).toHaveLength(2);

    const a = sums.find((s) => s.ws.name === "alpha")!;
    expect(a.online).toBe(true);
    expect(a.detail?.mission?.title).toBe("Alpha mission");
    expect(a.detail?.tasks.filter((t) => t.status === "done")).toHaveLength(1);

    const b = sums.find((s) => s.ws.name === "beta")!;
    expect(b.online).toBe(false);
    expect(b.detail).toBeNull();
  });
});

describe("stopAndWipeMission", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns ok on a successful wipe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, wiped: true }) }),
    );
    const { stopAndWipeMission } = await import("../api");
    const r = await stopAndWipeMission("s", "Real Mission");
    expect(r.ok).toBe(true);
  });

  it("surfaces the 409 reason on a name mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Confirmation does not match the mission title",
          wiped: false,
        }),
      }),
    );
    const { stopAndWipeMission } = await import("../api");
    const r = await stopAndWipeMission("s", "wrong");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("does not match");
  });

  it("treats a dropped connection (daemon bounce) as success in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const { stopAndWipeMission } = await import("../api");
    const r = await stopAndWipeMission("s", "Real Mission");
    expect(r.ok).toBe(true);
  });
});
