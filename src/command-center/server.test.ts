import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentIdentifier } from "../widgets/lib/pane-comms.ts";
import {
  ensureTasksDir,
  saveMission,
  saveTask,
  loadTask,
  loadMission,
  type Task,
} from "../lib/task-store.ts";
import { saveValidationState, loadValidationState } from "../lib/validation.ts";
import { addTodo, loadTodos, setTodoDone } from "../lib/todo-store.ts";
import { appendEvent, readEvents } from "../lib/event-log.ts";
import { loadResearchState, saveResearchState } from "../lib/research.ts";
import { _setExecutor, type PaneInfo } from "../widgets/lib/pane-comms.ts";
import { _setTmuxRunner } from "./discovery.ts";
import { createApp } from "./server.ts";
import { WIPE_STANDDOWN_TIMING } from "../send.ts";
import { makeTask, makePane } from "../__tests__/support.ts";

let tmpDir: string;
let restoreTmux: () => void;
let restoreDiscoveryTmux: () => void;
let mockPanes: PaneInfo[];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmux-ide-cc-srv-test-"));
  ensureTasksDir(tmpDir);
  mockPanes = [];

  restoreTmux = _setExecutor((_cmd: string, args: string[]) => {
    if (args[0] === "list-panes") {
      return mockPanes
        .map(
          (p) =>
            `${p.id}\t${p.index}\t${p.title}\t${p.currentCommand}\t${p.width}\t${p.height}\t${p.active ? "1" : "0"}\t${p.role ?? ""}\t${p.name ?? ""}\t${p.type ?? ""}`,
        )
        .join("\n");
    }
    return "";
  });

  restoreDiscoveryTmux = _setTmuxRunner((args: string[]) => {
    if (args[0] === "list-sessions") return "test-project";
    if (args[0] === "display-message") return tmpDir;
    return "";
  });
});

afterEach(() => {
  restoreTmux();
  restoreDiscoveryTmux();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /api/sessions", () => {
  it("returns discovered sessions", async () => {
    saveMission(tmpDir, {
      title: "Test mission",
      description: "",
      status: "active",
      branch: null,
      milestones: [],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });
    saveTask(tmpDir, makeTask({ id: "001", status: "done" }));
    saveTask(tmpDir, makeTask({ id: "002", status: "todo" }));

    const app = createApp();
    const res = await app.request("/api/sessions");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      sessions: Array<{ name: string; stats: { totalTasks: number; doneTasks: number } }>;
    };
    expect(body.sessions.length).toBe(1);
    expect(body.sessions[0]!.name).toBe("test-project");
    expect(body.sessions[0]!.stats.totalTasks).toBe(2);
    expect(body.sessions[0]!.stats.doneTasks).toBe(1);
  });
});

describe("GET /api/directory/:name", () => {
  it("returns directory detail", async () => {
    const pane = makePane({ id: "%1", index: 0, title: "Agent 1", currentCommand: "claude" });
    const name = agentIdentifier(pane);
    saveTask(tmpDir, makeTask({ id: "001", status: "in-progress", assignee: name }));
    mockPanes = [pane];

    const app = createApp();
    const res = await app.request("/api/directory/test-project");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      session: string;
      tasks: Task[];
      agents: Array<{ paneTitle: string }>;
    };
    expect(body.session).toBe("test-project");
    expect(body.tasks.length).toBe(1);
    expect(body.agents.length).toBe(1);
    expect(body.agents[0]!.paneTitle).toBe(name);
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/directory/:name/task/:id", () => {
  it("updates task status", async () => {
    saveTask(tmpDir, makeTask({ id: "001", status: "todo" }));

    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; task: Task };
    expect(body.ok).toBe(true);
    expect(body.task.status).toBe("in-progress");

    const loaded = loadTask(tmpDir, "001");
    expect(loaded?.status).toBe("in-progress");
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/task/001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown task", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/999", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects invalid status via zod validation", async () => {
    saveTask(tmpDir, makeTask({ id: "001" }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid-status" }),
    });
    expect(res.status).toBe(400);
  });

  it("operator override marks a review task done and logs an override event", async () => {
    saveTask(tmpDir, makeTask({ id: "001", status: "review" }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done", override: true }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { task: Task }).task.status).toBe("done");
    const overrideEvents = readEvents(tmpDir).filter((e) => e.type === "override");
    expect(overrideEvents.length).toBe(1);
    expect(overrideEvents[0]!.message).toContain("001");
  });

  it("refuses a non-override done from review with the reviewer reason (409)", async () => {
    saveTask(tmpDir, makeTask({ id: "001", status: "review" }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("validator/reviewer");
    expect(loadTask(tmpDir, "001")?.status).toBe("review");
    expect(readEvents(tmpDir).filter((e) => e.type === "override").length).toBe(0);
  });

  it("refuses a non-override done that skips review with the review reason (409)", async () => {
    saveTask(tmpDir, makeTask({ id: "001", status: "todo" }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("must be in 'review'");
  });
});

describe("POST /api/directory/:name/task (create)", () => {
  it("creates a task", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New task", priority: 1 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; task: Task };
    expect(body.ok).toBe(true);
    expect(body.task.title).toBe("New task");
    expect(body.task.status).toBe("todo");
    expect(body.task.id).toBeTruthy();
  });

  it("returns 400 when title is missing", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "no title" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is only whitespace", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  " }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });
    expect(res.status).toBe(404);
  });

  it("persists the create-only fields (specialty/milestone/fulfills/depends)", async () => {
    saveMission(tmpDir, {
      title: "M",
      description: "",
      status: "active",
      goals: [],
      milestones: [
        {
          id: "M1",
          title: "First",
          description: "",
          status: "active",
          order: 1,
          created: "",
          updated: "",
        },
      ],
      created: "",
      updated: "",
    });
    writeFileSync(join(tmpDir, ".tasks", "validation-contract.md"), "- **VAL-A** does a thing\n");
    saveTask(tmpDir, makeTask({ id: "001", title: "Dep" }));

    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Full task",
        specialty: "implementation",
        milestone: "M1",
        fulfills: ["VAL-A"],
        depends: ["001"],
        assignee: "cw2",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { task: Task };
    expect(body.task.specialty).toBe("implementation");
    expect(body.task.milestone).toBe("M1");
    expect(body.task.fulfills).toEqual(["VAL-A"]);
    expect(body.task.depends_on).toEqual(["001"]);
    expect(body.task.assignee).toBe("cw2");
    // Round-trips through the store.
    const stored = loadTask(tmpDir, body.task.id);
    expect(stored?.fulfills).toEqual(["VAL-A"]);
  });

  it("rejects an unknown assertion in fulfills (409)", async () => {
    writeFileSync(join(tmpDir, ".tasks", "validation-contract.md"), "- **VAL-A** real\n");
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", fulfills: ["VAL-A", "VAL-GHOST"] }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { unknownAssertions: string[] };
    expect(body.unknownAssertions).toEqual(["VAL-GHOST"]);
  });

  it("rejects a dangling task in depends (409)", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", depends: ["999"] }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { unknownTasks: string[] };
    expect(body.unknownTasks).toEqual(["999"]);
  });

  it("rejects an unknown milestone (409)", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", milestone: "M9" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/directory/:name/milestones/insert (renumber + cascade)", () => {
  function seedTwoMilestones() {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "active",
      milestones: [
        {
          id: "M1",
          title: "One",
          description: "",
          status: "active",
          order: 1,
          created: "",
          updated: "",
        },
        {
          id: "M2",
          title: "Two",
          description: "",
          status: "locked",
          order: 2,
          created: "",
          updated: "",
        },
      ],
      created: "",
      updated: "",
    });
  }

  it("inserts at a position, renumbers contiguously, and cascades task milestone refs", async () => {
    seedTwoMilestones();
    saveTask(tmpDir, makeTask({ id: "001", milestone: "M2" }));

    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones/insert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Inserted", position: 2 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      milestones: { id: string; title: string; order: number }[];
      remapped: Record<string, string>;
    };
    expect(body.milestones.map((m) => m.id)).toEqual(["M1", "M2", "M3"]);
    expect(body.milestones.find((m) => m.id === "M2")!.title).toBe("Inserted");
    expect(body.milestones.find((m) => m.id === "M3")!.title).toBe("Two");
    expect(body.remapped).toEqual({ M2: "M3" });

    // The task that pointed at the old M2 now points at M3.
    const mission = loadMission(tmpDir)!;
    expect(mission.milestones.map((m) => m.order)).toEqual([1, 2, 3]);
    const stored = loadTask(tmpDir, "001");
    expect(stored?.milestone).toBe("M3");
  });

  it("appends at the end when position exceeds the count", async () => {
    seedTwoMilestones();
    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones/insert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Last", position: 99 }),
    });
    const body = (await res.json()) as { milestones: { id: string; title: string }[] };
    expect(body.milestones.map((m) => m.id)).toEqual(["M1", "M2", "M3"]);
    expect(body.milestones.find((m) => m.id === "M3")!.title).toBe("Last");
  });
});

describe("POST /api/directory/:name/validation/contract (text editor + I5)", () => {
  it("saves contract text and round-trips via GET", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "- **VAL-A** a\n- **VAL-B** b\n" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; assertions: string[] };
    expect(body.assertions.sort()).toEqual(["VAL-A", "VAL-B"]);

    const get = await app.request("/api/directory/test-project/validation/contract");
    const doc = (await get.json()) as { content: string };
    expect(doc.content).toContain("VAL-A");
  });

  it("rejects dropping an assertion a task still claims (409)", async () => {
    writeFileSync(
      join(tmpDir, ".tasks", "validation-contract.md"),
      "- **VAL-A** a\n- **VAL-B** b\n",
    );
    saveTask(tmpDir, makeTask({ id: "001", fulfills: ["VAL-B"] }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "- **VAL-A** a\n" }), // drops VAL-B
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { stillClaimed: Record<string, string[]> };
    expect(body.stillClaimed["VAL-B"]).toEqual(["001"]);
  });

  it("allows adding/reordering assertions", async () => {
    writeFileSync(join(tmpDir, ".tasks", "validation-contract.md"), "- **VAL-A** a\n");
    saveTask(tmpDir, makeTask({ id: "001", fulfills: ["VAL-A"] }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "- **VAL-B** b\n- **VAL-A** a\n" }),
    });
    expect(res.status).toBe(200);
  });

  it("ignores prior-generation tasks claiming an assertion absent from the contract (generation-scoped guard)", async () => {
    // Retained prior-mission task (created before this mission) claims VAL-OLD,
    // an id the current contract never had. Without generation scoping this
    // rejects every save — even a pure addition.
    saveMission(tmpDir, {
      title: "M",
      description: "",
      status: "active",
      goals: [],
      milestones: [],
      created: "2026-06-01T00:00:00Z",
      updated: "2026-06-01T00:00:00Z",
    });
    writeFileSync(join(tmpDir, ".tasks", "validation-contract.md"), "- **VAL-A** a\n");
    saveTask(
      tmpDir,
      makeTask({ id: "001", fulfills: ["VAL-OLD"], created: "2026-05-01T00:00:00Z" }),
    );
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "- **VAL-A** a\n- **VAL-B** b\n" }), // pure addition
    });
    expect(res.status).toBe(200);
  });

  it("still rejects a current-generation task's dropped assertion (409)", async () => {
    saveMission(tmpDir, {
      title: "M",
      description: "",
      status: "active",
      goals: [],
      milestones: [],
      created: "2026-06-01T00:00:00Z",
      updated: "2026-06-01T00:00:00Z",
    });
    writeFileSync(
      join(tmpDir, ".tasks", "validation-contract.md"),
      "- **VAL-A** a\n- **VAL-B** b\n",
    );
    saveTask(tmpDir, makeTask({ id: "002", fulfills: ["VAL-B"], created: "2026-06-15T00:00:00Z" }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "- **VAL-A** a\n" }), // drops VAL-B
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { stillClaimed: Record<string, string[]> };
    expect(body.stillClaimed["VAL-B"]).toEqual(["002"]);
  });
});

describe("POST /api/directory/:name/validation/assert/:assertId", () => {
  it("sets an assertion passing with evidence and persists to state", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/assert/VAL-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "passing", evidence: "ran the suite", verifiedBy: "cw4" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string; evidence: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("passing");

    const state = loadValidationState(tmpDir)!;
    expect(state.assertions["VAL-1"]!.status).toBe("passing");
    expect(state.assertions["VAL-1"]!.evidence).toBe("ran the suite");
    expect(state.assertions["VAL-1"]!.verifiedBy).toBe("cw4");
  });

  it("rejects passing without evidence (400) and writes nothing", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation/assert/VAL-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "passing" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Evidence is required");
    expect(loadValidationState(tmpDir)).toBeNull();
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/validation/assert/VAL-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/directory/:name/mission/wipe (kill-switch)", () => {
  function seedMission(title: string) {
    saveMission(tmpDir, {
      title,
      description: "",
      status: "active",
      milestones: [
        {
          id: "M1",
          title: "One",
          description: "",
          status: "active",
          order: 1,
          created: "",
          updated: "",
        },
      ],
      created: "",
      updated: "",
    });
  }

  it("no-ops when the confirmation name does not match (409, nothing wiped)", async () => {
    seedMission("Real Mission");
    saveTask(tmpDir, makeTask({ id: "001" }));
    let bounced = false;
    const app = createApp({ bounceDaemon: () => (bounced = true) });
    const res = await app.request("/api/directory/test-project/mission/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "wrong name" }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { wiped: boolean }).wiped).toBe(false);
    // Nothing erased, no bounce, no override event.
    expect(loadMission(tmpDir)?.title).toBe("Real Mission");
    expect(loadTask(tmpDir, "001")).not.toBeNull();
    expect(bounced).toBe(false);
    expect(readEvents(tmpDir).filter((e) => e.type === "override").length).toBe(0);
  });

  it("stands down agents, wipes the tracker, logs the override, and bounces the daemon", async () => {
    seedMission("Real Mission");
    saveTask(tmpDir, makeTask({ id: "001" }));
    mockPanes = [
      makePane({ id: "%1", title: "cw1", name: "cw1", role: "teammate", currentCommand: "claude" }),
    ];
    let bounced = false;
    const delivered: string[] = [];
    const timings: (typeof WIPE_STANDDOWN_TIMING | undefined)[] = [];
    const app = createApp({
      bounceDaemon: () => (bounced = true),
      deliver: async (_dir, _session, pane, _body, _batchId, timing) => {
        delivered.push(pane.id);
        timings.push(timing);
        return { outcome: "delivered", attempts: 1 };
      },
    });
    const res = await app.request("/api/directory/test-project/mission/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "Real Mission" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { wiped: boolean }).wiped).toBe(true);
    // Stand-down broadcast reached the agent pane before the wipe.
    expect(delivered).toEqual(["%1"]);
    // Broadcast used the tight per-pane budget so the confirm→response stays bounded.
    expect(timings).toEqual([WIPE_STANDDOWN_TIMING]);
    // Tracker erased + daemon bounced.
    expect(loadMission(tmpDir)).toBeNull();
    expect(loadTask(tmpDir, "001")).toBeNull();
    expect(bounced).toBe(true);
    // Operator-attributed audit entry.
    const overrides = readEvents(tmpDir).filter((e) => e.type === "override");
    expect(overrides.length).toBe(1);
    expect(overrides[0]!.message).toContain("kill-switch");
  });

  it("clears the plans/ directory when includePlans is true", async () => {
    seedMission("Real Mission");
    mkdirSync(join(tmpDir, "plans"), { recursive: true });
    writeFileSync(join(tmpDir, "plans", "scratch.md"), "# scratch");
    const app = createApp({ bounceDaemon: () => undefined });
    const res = await app.request("/api/directory/test-project/mission/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "Real Mission", includePlans: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { planFiles: number } };
    expect(body.summary.planFiles).toBe(1);
    expect(existsSync(join(tmpDir, "plans", "scratch.md"))).toBe(false);
  });

  it("preserves plans when includePlans is omitted", async () => {
    seedMission("Real Mission");
    mkdirSync(join(tmpDir, "plans"), { recursive: true });
    writeFileSync(join(tmpDir, "plans", "scratch.md"), "# scratch");
    const app = createApp({ bounceDaemon: () => undefined });
    const res = await app.request("/api/directory/test-project/mission/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "Real Mission" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: { planFiles: number } };
    expect(body.summary.planFiles).toBe(0);
    expect(existsSync(join(tmpDir, "plans", "scratch.md"))).toBe(true);
  });
});

describe("POST /api/directory/:name/send (composer)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("returns a batchId immediately and delivers reliably to an agent pane", async () => {
    mockPanes = [makePane({ id: "%1", title: "cw1", name: "cw1", currentCommand: "claude" })];
    const calls: string[] = [];
    const app = createApp({
      deliver: async (_dir, _session, pane) => {
        calls.push(pane.id);
        return { outcome: "delivered", attempts: 1 };
      },
    });
    const res = await app.request("/api/directory/test-project/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "cw1", message: "hello" }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { batchId: string; recipients: { status: string }[] };
    expect(body.batchId).toBeTruthy();
    expect(body.recipients).toHaveLength(1);
    expect(calls).toEqual(["%1"]);

    await tick();
    const poll = await app.request(`/api/directory/test-project/send/batch/${body.batchId}`);
    const state = (await poll.json()) as {
      done: boolean;
      ok: boolean;
      recipients: { status: string }[];
    };
    expect(state.done).toBe(true);
    expect(state.ok).toBe(true);
    expect(state.recipients[0]!.status).toBe("delivered");
  });

  it("pastes directly (no reliable delivery) to a non-agent pane", async () => {
    mockPanes = [
      makePane({ id: "%2", title: "team-input", name: "team-input", currentCommand: "zsh" }),
    ];
    let delivered = false;
    const app = createApp({
      deliver: async () => {
        delivered = true;
        return { outcome: "delivered", attempts: 1 };
      },
    });
    const res = await app.request("/api/directory/test-project/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "team-input", message: "hi" }),
    });
    const body = (await res.json()) as { recipients: { status: string }[] };
    expect(delivered).toBe(false);
    expect(body.recipients[0]!.status).toBe("delivered");
  });

  it("fans out to a wildcard and reports per-recipient status (1 failed)", async () => {
    mockPanes = [
      makePane({ id: "%1", title: "cw1", name: "cw1", role: "teammate", currentCommand: "claude" }),
      makePane({ id: "%2", title: "cw2", name: "cw2", role: "teammate", currentCommand: "claude" }),
    ];
    const app = createApp({
      deliver: async (_dir, _session, pane) => ({
        outcome: pane.id === "%2" ? "failed" : "delivered",
        attempts: pane.id === "%2" ? 4 : 1,
      }),
    });
    const res = await app.request("/api/directory/test-project/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "cw*", message: "batch" }),
    });
    const body = (await res.json()) as { batchId: string; fanOut: boolean };
    expect(body.fanOut).toBe(true);

    await tick();
    const poll = await app.request(`/api/directory/test-project/send/batch/${body.batchId}`);
    const state = (await poll.json()) as {
      ok: boolean;
      recipients: { paneId: string; status: string }[];
    };
    expect(state.ok).toBe(false);
    expect(state.recipients.find((r) => r.paneId === "%1")!.status).toBe("delivered");
    expect(state.recipients.find((r) => r.paneId === "%2")!.status).toBe("failed");
  });

  it("fireAndForget skips the reliable path even for an agent pane", async () => {
    mockPanes = [makePane({ id: "%1", title: "cw1", name: "cw1", currentCommand: "claude" })];
    let delivered = false;
    const app = createApp({
      deliver: async () => {
        delivered = true;
        return { outcome: "delivered", attempts: 1 };
      },
    });
    const res = await app.request("/api/directory/test-project/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "cw1", message: "quick", fireAndForget: true }),
    });
    const body = (await res.json()) as { recipients: { status: string }[] };
    expect(delivered).toBe(false);
    expect(body.recipients[0]!.status).toBe("delivered");
  });

  it("returns 404 polling an unknown batch", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/send/batch/nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the target matches no pane", async () => {
    mockPanes = [makePane({ id: "%1", title: "cw1", name: "cw1", currentCommand: "claude" })];
    const app = createApp();
    const res = await app.request("/api/directory/test-project/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "ghost", message: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/directory/:name/send/preview", () => {
  it("resolves a glob to the matching agent pane names", async () => {
    mockPanes = [
      makePane({ id: "%1", title: "cw1", name: "cw1", role: "teammate", currentCommand: "claude" }),
      makePane({ id: "%2", title: "cw2", name: "cw2", role: "teammate", currentCommand: "claude" }),
      makePane({ id: "%3", title: "cw3", name: "cw3", role: "teammate", currentCommand: "claude" }),
    ];
    const app = createApp();
    const res = await app.request("/api/directory/test-project/send/preview?target=cw*");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { target: string; matches: { name: string | null }[] };
    expect(body.target).toBe("cw*");
    expect(body.matches.map((m) => m.name)).toEqual(["cw1", "cw2", "cw3"]);
  });

  it("returns 200 with an empty match list for an unmatched target (not an error)", async () => {
    mockPanes = [
      makePane({ id: "%1", title: "cw1", name: "cw1", role: "teammate", currentCommand: "claude" }),
    ];
    const app = createApp();
    const res = await app.request("/api/directory/test-project/send/preview?target=xyz*");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: unknown[] };
    expect(body.matches).toEqual([]);
  });

  it("returns an empty match list for an empty or missing target", async () => {
    mockPanes = [
      makePane({ id: "%1", title: "cw1", name: "cw1", role: "teammate", currentCommand: "claude" }),
    ];
    const app = createApp();

    const empty = await app.request("/api/directory/test-project/send/preview?target=");
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { matches: unknown[] }).matches).toEqual([]);

    const missing = await app.request("/api/directory/test-project/send/preview");
    expect(missing.status).toBe(200);
    expect(((await missing.json()) as { matches: unknown[] }).matches).toEqual([]);
  });

  it("returns 404 for an unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/send/preview?target=cw*");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/directory/:name/task/:id", () => {
  it("deletes a task", async () => {
    saveTask(tmpDir, makeTask({ id: "001" }));
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/001", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(loadTask(tmpDir, "001")).toBe(null);
  });

  it("returns 404 for unknown task", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/task/999", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/task/001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/directory/:name/plans", () => {
  it("returns plan list with metadata", async () => {
    const plansDir = join(tmpDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      join(plansDir, "01-test.md"),
      "# Plan 01\n\n**Status:** `pending`\n**Effort:** Low\n",
    );

    const app = createApp();
    const res = await app.request("/api/directory/test-project/plans");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<{ name: string; status: string }> };
    expect(body.plans.length >= 1).toBeTruthy();
    const plan = body.plans.find((p) => p.name === "01-test");
    expect(plan).toBeTruthy();
    expect(plan!.status).toBe("pending");
  });
});

describe("POST /api/directory/:name/plans (create)", () => {
  const create = (app: ReturnType<typeof createApp>, body: unknown) =>
    app.request("/api/directory/test-project/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("creates a stub plan file and makes it readable", async () => {
    const app = createApp();
    const res = await create(app, { name: "my-new-plan" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; path: string };
    expect(body.ok).toBe(true);
    expect(body.path).toBe("my-new-plan.md");

    const read = await app.request("/api/directory/test-project/plans/my-new-plan.md");
    expect(read.status).toBe(200);
    expect(((await read.json()) as { content: string }).content).toContain("# my-new-plan");
  });

  it("rejects a name collision with 409", async () => {
    const app = createApp();
    expect((await create(app, { name: "dupe" })).status).toBe(201);
    const res = await create(app, { name: "dupe" });
    expect(res.status).toBe(409);
  });

  it("rejects a non-kebab-case name with 400", async () => {
    const app = createApp();
    expect((await create(app, { name: "Bad Name" })).status).toBe(400);
    expect((await create(app, { name: "UPPER" })).status).toBe(400);
  });

  it("rejects an empty name with 400", async () => {
    const app = createApp();
    expect((await create(app, { name: "" })).status).toBe(400);
    expect((await create(app, { name: "   " })).status).toBe(400);
  });

  it("rejects a path-traversal name with 400", async () => {
    const app = createApp();
    expect((await create(app, { name: "../evil" })).status).toBe(400);
    expect((await create(app, { name: "foo/bar" })).status).toBe(400);
  });

  it("returns 404 for an unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("research endpoints", () => {
  it("returns research state, active task, and recent findings", async () => {
    saveTask(
      tmpDir,
      makeTask({
        id: "010",
        title: "Research: mission start",
        status: "done",
        updated: "2026-01-02T00:00:00Z",
        tags: ["research", "mission_start"],
        salientSummary: "Initial audit completed",
      }),
    );
    saveTask(
      tmpDir,
      makeTask({
        id: "011",
        title: "Research: periodic",
        status: "in-progress",
        updated: "2026-01-03T00:00:00Z",
        tags: ["research", "periodic"],
      }),
    );
    saveResearchState(tmpDir, {
      lastResearchAt: { periodic: "2026-01-03T00:00:00Z" },
      missionStartAnalyzed: true,
      milestoneTaskCounts: {},
      activeResearchTaskId: "011",
      retryWindow: [],
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/research");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      state: { activeResearchTaskId: string | null; missionStartAnalyzed: boolean };
      activeTask: Task | null;
      findings: Task[];
    };
    expect(body.state.activeResearchTaskId).toBe("011");
    expect(body.state.missionStartAnalyzed).toBe(true);
    expect(body.activeTask?.id).toBe("011");
    expect(body.findings.map((task) => task.id)).toEqual(["010"]);
  });

  it("manually dispatches research through the API", async () => {
    mockPanes = [
      makePane({
        id: "%2",
        index: 1,
        title: "Researcher",
        role: "researcher",
        currentCommand: "zsh",
      }),
    ];

    const app = createApp();
    const res = await app.request("/api/directory/test-project/research/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "periodic" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; task: Task };
    expect(body.ok).toBe(true);
    expect(body.task.tags).toEqual(["research", "periodic"]);
    expect(body.task.specialty).toBe("researcher");

    const persisted = loadTask(tmpDir, body.task.id);
    expect(persisted?.status).toBe("in-progress");
    expect(loadResearchState(tmpDir).activeResearchTaskId).toBe(body.task.id);
  });
});

describe("GET /api/directory/:name/plans/:filename", () => {
  it("returns plan content", async () => {
    const plansDir = join(tmpDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, "test-plan.md"), "# Test Plan\n\nSome content.");

    const app = createApp();
    const res = await app.request("/api/directory/test-project/plans/test-plan");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; content: string; marks: unknown };
    expect(body.content.includes("Test Plan")).toBeTruthy();
  });

  it("returns 404 for missing plan", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/plans/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/directory/:name/plans/:filename", () => {
  it("saves plan content", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/plans/new-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "# New Plan\n\nContent here." }),
    });
    expect(res.status).toBe(200);

    const getRes = await app.request("/api/directory/test-project/plans/new-plan");
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { content: string };
    expect(body.content.includes("New Plan")).toBeTruthy();
  });
});

describe("DELETE /api/directory/:name/plans/:filename", () => {
  it("deletes a plan file", async () => {
    const plansDir = join(tmpDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, "to-delete.md"), "# Delete me");

    const app = createApp();
    const res = await app.request("/api/directory/test-project/plans/to-delete", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const getRes = await app.request("/api/directory/test-project/plans/to-delete");
    expect(getRes.status).toBe(404);
  });
});

describe("POST /api/directory/:name/plans/:filename/done", () => {
  it("marks a plan as done", async () => {
    const plansDir = join(tmpDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, "70-test.md"), "# Plan 70\n\n**Status:** `in-progress`\n");

    const app = createApp();
    const res = await app.request("/api/directory/test-project/plans/70-test/done", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; plan: { status: string } };
    expect(body.ok).toBe(true);
    expect(body.plan.status).toBe("done");
  });
});

describe("GET /api/directory/:name/diff", () => {
  it("returns diff shape", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/diff");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { diff: string; files: unknown[] };
    expect(typeof body.diff).toBe("string");
    expect(Array.isArray(body.files)).toBeTruthy();
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/diff");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/directory/:name/events", () => {
  it("returns recent events", async () => {
    appendEvent(tmpDir, {
      timestamp: new Date().toISOString(),
      type: "dispatch",
      taskId: "001",
      message: "Test event",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: Array<{ type: string; message: string; relative: string }>;
    };
    expect(body.events.length >= 1).toBeTruthy();
    expect(body.events[0]!.message).toBe("Test event");
    expect(body.events[0]!.relative).toBeTruthy();
  });

  it("returns empty events when no log exists", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/events");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/directory/:name/diff/:file", () => {
  it("returns per-file diff shape", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/diff/src/index.ts");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { file: string; diff: string };
    expect(body.file).toBe("src/index.ts");
    expect(typeof body.diff).toBe("string");
  });

  it("returns 404 for unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/diff/file.ts");
    expect(res.status).toBe(404);
  });
});

// GET /api/events (SSE) — stream endpoint; smoke-test headers only
describe("GET /api/events (SSE)", () => {
  it("returns SSE content-type header", async () => {
    const app = createApp();
    const res = await app.request("/api/events");

    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType?.includes("text/event-stream")).toBeTruthy();
  });
});

describe("GET /", () => {
  it("returns a response for root path", async () => {
    const app = createApp();
    const res = await app.request("/");
    // With dashboard/out: serves HTML (200). Without: middleware falls through (404).
    expect([200, 404]).toContain(res.status);
  });
});

describe("GET /api/directory/:name/milestones", () => {
  it("returns milestones with task counts", async () => {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "active",
      branch: null,
      milestones: [
        {
          id: "M1",
          title: "Phase 1",
          description: "",
          status: "active",
          order: 1,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
        {
          id: "M2",
          title: "Phase 2",
          description: "",
          status: "locked",
          order: 2,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      ],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });
    saveTask(tmpDir, makeTask({ id: "001", milestone: "M1" }));
    saveTask(tmpDir, makeTask({ id: "002", milestone: "M1", status: "done" }));
    saveTask(tmpDir, makeTask({ id: "003", milestone: "M2" }));

    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      milestones: Array<{ id: string; taskCount: number; tasksDone: number }>;
    };
    expect(body.milestones.length).toBe(2);
    expect(body.milestones[0]!.id).toBe("M1");
    expect(body.milestones[0]!.taskCount).toBe(2);
    expect(body.milestones[0]!.tasksDone).toBe(1);
    expect(body.milestones[1]!.id).toBe("M2");
    expect(body.milestones[1]!.taskCount).toBe(1);
  });
});

describe("POST /api/directory/:name/milestones", () => {
  it("creates a milestone", async () => {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "planning",
      branch: null,
      milestones: [],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Foundation", sequence: 1 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; milestone: { id: string; status: string } };
    expect(body.ok).toBe(true);
    expect(body.milestone.id).toBe("M1");
    expect(body.milestone.status).toBe("active");

    // Verify persisted
    const mission = loadMission(tmpDir)!;
    expect(mission.milestones.length).toBe(1);
  });

  it("updates a milestone status", async () => {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "active",
      branch: null,
      milestones: [
        {
          id: "M1",
          title: "Phase 1",
          description: "",
          status: "active",
          order: 1,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      ],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones/M1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "validating" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; milestone: { status: string } };
    expect(body.milestone.status).toBe("validating");
  });

  it("rejects invalid milestone transitions", async () => {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "active",
      branch: null,
      milestones: [
        {
          id: "M1",
          title: "Phase 1",
          description: "",
          status: "locked",
          order: 1,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      ],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones/M1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid milestone status transition");
  });

  it("rejects invalid milestone status payloads", async () => {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "active",
      branch: null,
      milestones: [
        {
          id: "M1",
          title: "Phase 1",
          description: "",
          status: "active",
          order: 1,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      ],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/milestones/M1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "bogus" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/directory/:name/validation", () => {
  it("returns validation state and contract", async () => {
    mkdirSync(join(tmpDir, ".tasks"), { recursive: true });
    writeFileSync(join(tmpDir, ".tasks", "validation-contract.md"), "**ASSERT01**: Auth works");
    saveValidationState(tmpDir, {
      assertions: {
        ASSERT01: {
          status: "passing",
          verifiedBy: "v",
          verifiedAt: "2026-01-01T00:00:00Z",
          evidence: "ok",
          blockedBy: null,
        },
      },
      lastVerified: "2026-01-01T00:00:00Z",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/validation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      contract: string;
      state: { assertions: Record<string, { status: string }> };
    };
    expect(body.contract).toContain("ASSERT01");
    expect(body.state.assertions["ASSERT01"]!.status).toBe("passing");
  });
});

describe("GET /api/directory/:name/skills", () => {
  it("returns loaded skills", async () => {
    const skillsDir = join(tmpDir, ".tmux-ide", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "frontend.md"),
      `---\nname: frontend\nspecialties: [frontend, css]\nrole: teammate\ndescription: Frontend dev\n---\nYou build UIs.`,
    );

    const app = createApp();
    const res = await app.request("/api/directory/test-project/skills");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ name: string; specialties: string[] }> };
    expect(body.skills.length).toBe(1);
    expect(body.skills[0]!.name).toBe("frontend");
    expect(body.skills[0]!.specialties).toContain("frontend");
  });
});

describe("GET /api/directory/:name/mission", () => {
  it("returns mission with validation summary", async () => {
    saveMission(tmpDir, {
      title: "Ship v2",
      description: "Major release",
      status: "active",
      branch: null,
      milestones: [
        {
          id: "M1",
          title: "Phase 1",
          description: "",
          status: "done",
          order: 1,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      ],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });
    saveValidationState(tmpDir, {
      assertions: {
        A1: {
          status: "passing",
          verifiedBy: null,
          verifiedAt: null,
          evidence: null,
          blockedBy: null,
        },
        A2: {
          status: "failing",
          verifiedBy: null,
          verifiedAt: null,
          evidence: null,
          blockedBy: null,
        },
      },
      lastVerified: null,
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/mission");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mission: { title: string };
      validationSummary: { total: number; passing: number; failing: number };
    };
    expect(body.mission.title).toBe("Ship v2");
    expect(body.validationSummary.total).toBe(2);
    expect(body.validationSummary.passing).toBe(1);
    expect(body.validationSummary.failing).toBe(1);
  });
});

describe("POST /api/directory/:name/mission/plan-complete", () => {
  it("transitions mission from planning to active", async () => {
    saveMission(tmpDir, {
      title: "Test",
      description: "",
      status: "planning",
      branch: null,
      milestones: [
        {
          id: "M1",
          title: "Phase 1",
          description: "",
          status: "locked",
          order: 1,
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      ],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const app = createApp();
    const res = await app.request("/api/directory/test-project/mission/plan-complete", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      mission: { status: string; milestones: Array<{ id: string; status: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.mission.status).toBe("active");
    expect(body.mission.milestones[0]!.status).toBe("active");
  });
});

describe("GET /api/todos (owner action items aggregate)", () => {
  it("returns items across discovered workspaces labeled with the directory name", async () => {
    const a = addTodo(tmpDir, "approve the deploy", "lead");
    const b = addTodo(tmpDir, "rotate the token", "cw1");
    setTodoDone(tmpDir, b.id, true);

    const app = createApp();
    const res = await app.request("/api/todos");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      todos: Array<{ id: string; text: string; done: boolean; directory: string; source: string }>;
    };
    expect(body.todos).toHaveLength(2);
    expect(body.todos.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(body.todos.every((t) => t.directory === "test-project")).toBe(true);
    expect(body.todos[1]!.done).toBe(true);
    expect(body.todos[0]!.source).toBe("lead");
  });

  it("returns an empty list when no workspace has todos", async () => {
    const app = createApp();
    const res = await app.request("/api/todos");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { todos: unknown[] }).todos).toEqual([]);
  });
});

describe("POST /api/directory/:name/todo/:id (toggle)", () => {
  it("toggles done in the owning workspace store and back", async () => {
    const item = addTodo(tmpDir, "toggle me", "lead");
    const app = createApp();

    const res = await app.request(`/api/directory/test-project/todo/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; todo: { done: boolean; doneAt: string } };
    expect(body.ok).toBe(true);
    expect(body.todo.done).toBe(true);
    expect(body.todo.doneAt).not.toBeNull();
    expect(loadTodos(tmpDir)[0]!.done).toBe(true);

    const undo = await app.request(`/api/directory/test-project/todo/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: false }),
    });
    expect(undo.status).toBe(200);
    expect(loadTodos(tmpDir)[0]!.done).toBe(false);
  });

  it("returns 404 for an unknown session", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/nonexistent/todo/abc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown todo id", async () => {
    const app = createApp();
    const res = await app.request("/api/directory/test-project/todo/nope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a body without a boolean done", async () => {
    const item = addTodo(tmpDir, "strict", "lead");
    const app = createApp();
    const res = await app.request(`/api/directory/test-project/todo/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: "yes" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/directory/:name/focus", () => {
  function runnerReturning(map: Record<string, string | Error>): {
    runner: (cmd: string, args: string[]) => string;
    calls: string[];
  } {
    const calls: string[] = [];
    return {
      calls,
      runner: (cmd, args) => {
        calls.push(cmd);
        const key =
          cmd === "tmux"
            ? args[0]!
            : args[1]!.includes("to activate")
              ? "activate"
              : args[1]!.includes("name of every window")
                ? "list"
                : "raise";
        const result = map[key] ?? "";
        if (result instanceof Error) throw result;
        return result;
      },
    };
  }

  it("raises the attached terminal window via the injected runner", async () => {
    const { runner, calls } = runnerReturning({
      "list-clients": "/dev/ttys002\n",
      "show-environment": "TERM_PROGRAM=iTerm.app\n",
      list: "test-project — tmux\n",
    });
    const app = createApp({ focusRunner: runner });
    const res = await app.request("/api/directory/test-project/focus", { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; app: string; window: string | null };
    expect(body.ok).toBe(true);
    expect(body.app).toBe("iTerm");
    expect(body.window).toBe("test-project — tmux");
    expect(calls).toEqual(["tmux", "tmux", "osascript", "osascript", "osascript"]);
  });

  it("succeeds with a null window when only app activation is possible", async () => {
    const { runner } = runnerReturning({
      "show-environment": "TERM_PROGRAM=Apple_Terminal\n",
      list: new Error("not permitted"),
    });
    const app = createApp({ focusRunner: runner });
    const res = await app.request("/api/directory/test-project/focus", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; app: string; window: string | null };
    expect(body.app).toBe("Terminal");
    expect(body.window).toBeNull();
  });

  it("returns 409 with the reason when no terminal is identifiable", async () => {
    const { runner } = runnerReturning({
      "list-clients": "/dev/ttys002\n",
      "show-environment": new Error("unset"),
    });
    const app = createApp({ focusRunner: runner });
    const res = await app.request("/api/directory/test-project/focus", { method: "POST" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("unrecognized terminal");
  });

  it("returns 404 for an unknown session without running anything", async () => {
    const { runner, calls } = runnerReturning({});
    const app = createApp({ focusRunner: runner });
    const res = await app.request("/api/directory/nonexistent/focus", { method: "POST" });
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("POST /api/directory/:name/reset (workspace kill-switch)", () => {
  function seedMission(title: string) {
    saveMission(tmpDir, {
      title,
      description: "",
      status: "active",
      milestones: [],
      created: "",
      updated: "",
    });
  }

  it("returns 404 for an unknown session without stopping anything", async () => {
    const stopped: string[] = [];
    const app = createApp({ stopWorkspace: (s) => stopped.push(s) });
    const res = await app.request("/api/directory/nonexistent/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    expect(stopped).toEqual([]);
  });

  it("no-ops when the confirmation name does not match (409, nothing wiped or stopped)", async () => {
    seedMission("Real Mission");
    const stopped: string[] = [];
    const app = createApp({ stopWorkspace: (s) => stopped.push(s) });
    const res = await app.request("/api/directory/test-project/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "wrong name" }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reset: boolean }).reset).toBe(false);
    expect(loadMission(tmpDir)?.title).toBe("Real Mission");
    expect(stopped).toEqual([]);
    expect(readEvents(tmpDir).filter((e) => e.type === "override").length).toBe(0);
  });

  it("wipes the tracker, logs the override, and stops the session when a mission exists", async () => {
    seedMission("Real Mission");
    saveTask(tmpDir, makeTask({ id: "001" }));
    const stopped: string[] = [];
    const app = createApp({ stopWorkspace: (s) => stopped.push(s) });
    const res = await app.request("/api/directory/test-project/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "test-project" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; wiped: boolean; stopped: boolean };
    expect(body).toMatchObject({ ok: true, wiped: true, stopped: true });
    expect(loadMission(tmpDir)).toBeNull();
    expect(loadTask(tmpDir, "001")).toBeNull();
    expect(stopped).toEqual(["test-project"]);
    const overrides = readEvents(tmpDir).filter((e) => e.type === "override");
    expect(overrides.length).toBe(1);
    expect(overrides[0]!.message).toContain('stopped session "test-project"');
  });

  it("still stops the session when no mission is set", async () => {
    const stopped: string[] = [];
    const app = createApp({ stopWorkspace: (s) => stopped.push(s) });
    const res = await app.request("/api/directory/test-project/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "test-project" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; wiped: boolean; stopped: boolean };
    expect(body).toMatchObject({ ok: true, wiped: false, stopped: true });
    expect(stopped).toEqual(["test-project"]);
  });
});
