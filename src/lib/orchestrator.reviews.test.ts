import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTasksDir, saveTask } from "./task-store.ts";
import { dispatchReviews, buildReviewPrompt } from "./orchestrator.ts";
import { _setExecutor, type PaneInfo } from "../widgets/lib/pane-comms.ts";
import { makeTask, makePane, makeOrchestratorConfig, makeOrchestratorState } from "../__tests__/support.ts";

let dir: string;
let restore: () => void;
let sendKeys: string[];
let mockPanes: PaneInfo[];

function paneLine(p: PaneInfo): string {
  return `${p.id}\t${p.index}\t${p.title}\t${p.currentCommand}\t${p.width}\t${p.height}\t${p.active ? "1" : "0"}\t${p.role ?? ""}\t${p.name ?? ""}\t${p.type ?? ""}`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-reviews-test-"));
  ensureTasksDir(dir);
  sendKeys = [];
  mockPanes = [];
  restore = _setExecutor((_cmd: string, args: string[]) => {
    if (args[0] === "list-panes") return mockPanes.map(paneLine).join("\n");
    if (args[0] === "send-keys") sendKeys.push(args.join(" "));
    return "";
  });
});

afterEach(() => {
  restore();
  rmSync(dir, { recursive: true, force: true });
});

const idleValidator = makePane({
  id: "%3",
  title: "validator",
  currentCommand: "zsh",
  role: "validator",
  name: "validator",
  type: "agent",
});

function triggerCount(): number {
  return sendKeys.filter((s) => s.includes("New message — read: .tasks/dispatch/review-")).length;
}

describe("buildReviewPrompt", () => {
  it("names the task, assignee, and the reopen path on failure", () => {
    const p = buildReviewPrompt(makeTask({ id: "007" }), "cw3");
    expect(p).toContain("VALIDATE task 007");
    expect(p).toContain("assignee cw3");
    expect(p).toContain("tmux-ide task reopen 007");
  });
});

describe("dispatchReviews", () => {
  it("sends the validator one review trigger per task entering review", () => {
    saveTask(dir, makeTask({ id: "001", status: "review", assignee: "cw3" }));
    const config = makeOrchestratorConfig(dir, { dispatchMode: "missions" });
    const state = makeOrchestratorState();
    mockPanes = [idleValidator];

    dispatchReviews(config, state, [makeTask({ id: "001", status: "review", assignee: "cw3" })], mockPanes);

    expect(triggerCount()).toBe(1);
    expect(existsSync(join(dir, ".tasks/dispatch/review-001.md"))).toBe(true);
    expect(state.reviewDispatched!.has("001")).toBe(true);
  });

  it("does not re-dispatch a task already handed to the validator", () => {
    const config = makeOrchestratorConfig(dir, { dispatchMode: "missions" });
    const state = makeOrchestratorState();
    mockPanes = [idleValidator];
    const tasks = [makeTask({ id: "001", status: "review", assignee: "cw3" })];

    dispatchReviews(config, state, tasks, mockPanes);
    dispatchReviews(config, state, tasks, mockPanes);
    expect(triggerCount()).toBe(1);
  });

  it("re-dispatches after a task leaves review and re-enters (bounce)", () => {
    const config = makeOrchestratorConfig(dir, { dispatchMode: "missions" });
    const state = makeOrchestratorState();
    mockPanes = [idleValidator];

    dispatchReviews(config, state, [makeTask({ id: "001", status: "review" })], mockPanes);
    expect(triggerCount()).toBe(1);
    // task bounced to todo → leaves review
    dispatchReviews(config, state, [makeTask({ id: "001", status: "todo" })], mockPanes);
    expect(state.reviewDispatched!.has("001")).toBe(false);
    // re-submitted to review → dispatched again
    dispatchReviews(config, state, [makeTask({ id: "001", status: "review" })], mockPanes);
    expect(triggerCount()).toBe(2);
  });

  it("waits (does not dispatch) when no validator pane is present", () => {
    const config = makeOrchestratorConfig(dir, { dispatchMode: "missions" });
    const state = makeOrchestratorState();
    mockPanes = [makePane({ id: "%1", title: "cw1", currentCommand: "zsh", role: "teammate" })];

    dispatchReviews(config, state, [makeTask({ id: "001", status: "review" })], mockPanes);
    expect(triggerCount()).toBe(0);
    expect(state.reviewDispatched!.has("001")).toBe(false);
  });

  it("holds off while the validator is busy, then dispatches once idle", () => {
    const config = makeOrchestratorConfig(dir, { dispatchMode: "missions" });
    const state = makeOrchestratorState();
    const busyValidator = makePane({
      id: "%3",
      title: "⠙ validator",
      currentCommand: "claude",
      role: "validator",
      name: "validator",
      type: "agent",
    });

    dispatchReviews(config, state, [makeTask({ id: "001", status: "review" })], [busyValidator]);
    expect(triggerCount()).toBe(0); // busy → deferred, not marked dispatched
    expect(state.reviewDispatched!.has("001")).toBe(false);

    dispatchReviews(config, state, [makeTask({ id: "001", status: "review" })], [idleValidator]);
    expect(triggerCount()).toBe(1);
  });
});
