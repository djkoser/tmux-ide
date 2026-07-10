import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTasksDir, saveTask, loadTask } from "./lib/task-store.ts";
import { readEvents } from "./lib/event-log.ts";
import { taskCommand } from "./task.ts";
import { _setExecutor, type PaneInfo } from "./widgets/lib/pane-comms.ts";
import { makeTask } from "./__tests__/support.ts";

let dir: string;
let restore: (() => void) | null = null;
const origPane = process.env.TMUX_PANE;

function paneLine(p: PaneInfo): string {
  return `${p.id}\t${p.index}\t${p.title}\t${p.currentCommand}\t${p.width}\t${p.height}\t${p.active ? "1" : "0"}\t${p.role ?? ""}\t${p.name ?? ""}\t${p.type ?? ""}`;
}

/** Make resolveActor see the invoking pane as `role` by mocking $TMUX_PANE + list-panes. */
function actAs(paneId: string, role: string, name: string): void {
  process.env.TMUX_PANE = paneId;
  const pane: PaneInfo = {
    id: paneId,
    index: 0,
    title: name,
    currentCommand: "claude",
    width: 80,
    height: 24,
    active: true,
    role: role as PaneInfo["role"],
    name,
    type: "agent",
  };
  restore = _setExecutor((_c, args) => {
    if (args[0] === "list-panes") return paneLine(pane);
    // getSessionName reads config; let tmux calls no-op otherwise
    return "";
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-valx-test-"));
  ensureTasksDir(dir);
  delete process.env.TMUX_PANE;
});

afterEach(() => {
  restore?.();
  restore = null;
  if (origPane === undefined) delete process.env.TMUX_PANE;
  else process.env.TMUX_PANE = origPane;
  rmSync(dir, { recursive: true, force: true });
});

async function run(sub: string, id: string, extra: Record<string, unknown> = {}): Promise<Error | null> {
  try {
    await taskCommand(dir, { json: true, action: "task", sub, args: [id], values: extra });
    return null;
  } catch (e) {
    return e as Error;
  }
}

describe("task done — review-flow enforcement", () => {
  it("rejects a writer (non-reviewer actor) marking a reviewed task done", async () => {
    saveTask(dir, makeTask({ id: "001", status: "review", assignee: "cw3" }));
    actAs("%2", "teammate", "cw3");
    const err = await run("done", "001");
    expect(err).not.toBeNull();
    expect(err!.message).toContain("Only the validator/reviewer");
    expect(loadTask(dir, "001")!.status).toBe("review"); // unchanged
  });

  it("accepts a validator marking a reviewed task done", async () => {
    saveTask(dir, makeTask({ id: "001", status: "review", assignee: "cw3" }));
    actAs("%3", "validator", "validator");
    const err = await run("done", "001", { proof: "verified" });
    expect(err).toBeNull();
    expect(loadTask(dir, "001")!.status).toBe("done");
  });

  it("accepts a reviewer (renamed role) marking a reviewed task done", async () => {
    saveTask(dir, makeTask({ id: "001", status: "review" }));
    actAs("%3", "reviewer", "reviewer");
    expect(await run("done", "001")).toBeNull();
    expect(loadTask(dir, "001")!.status).toBe("done");
  });

  it("rejects skipping review (done from in-progress)", async () => {
    saveTask(dir, makeTask({ id: "001", status: "in-progress" }));
    actAs("%3", "validator", "validator");
    const err = await run("done", "001");
    expect(err).not.toBeNull();
    expect(err!.message).toContain("must be in 'review'");
  });

  it("logs an override event when --override forces a done", async () => {
    saveTask(dir, makeTask({ id: "001", status: "in-progress" }));
    // no actor pane; override bypasses the gate
    const err = await run("done", "001", { override: true });
    expect(err).toBeNull();
    expect(loadTask(dir, "001")!.status).toBe("done");
    const overrides = readEvents(dir).filter((e) => e.type === "override");
    expect(overrides.length).toBe(1);
    expect(overrides[0]!.taskId).toBe("001");
  });
});

describe("task reopen — review-flow enforcement", () => {
  it("rejects a writer reopening a task", async () => {
    saveTask(dir, makeTask({ id: "001", status: "review", assignee: "cw3" }));
    actAs("%2", "teammate", "cw3");
    const err = await run("reopen", "001");
    expect(err).not.toBeNull();
    expect(err!.message).toContain("Only the validator/reviewer or lead");
  });

  it("allows a validator to reopen, preserving the assignee", async () => {
    saveTask(dir, makeTask({ id: "001", status: "review", assignee: "cw3" }));
    actAs("%3", "validator", "validator");
    expect(await run("reopen", "001")).toBeNull();
    const t = loadTask(dir, "001")!;
    expect(t.status).toBe("todo");
    expect(t.assignee).toBe("cw3");
  });
});
