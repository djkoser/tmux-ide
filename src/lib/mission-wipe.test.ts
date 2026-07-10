import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTasksDir, saveTask, saveMission, loadTasks, loadMission } from "./task-store.ts";
import { saveValidationState, loadValidationState } from "./validation.ts";
import { wipeMission } from "./mission-wipe.ts";
import { resetClaims } from "./orchestrator.ts";
import { makeTask, makeMission } from "../__tests__/support.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-wipe-test-"));
  ensureTasksDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seed(): void {
  saveMission(dir, makeMission({ title: "PAY-9999 — demo" }));
  saveTask(dir, makeTask({ id: "001", status: "review" }));
  saveTask(dir, makeTask({ id: "002", status: "in-progress" }));
  saveValidationState(dir, {
    assertions: { "VAL-001": { status: "passing", verifiedBy: null, verifiedAt: null, evidence: null, blockedBy: null } },
    lastVerified: "2026-01-01T00:00:00Z",
  });
  writeFileSync(join(dir, ".tasks/validation-contract.md"), "# contract\nVAL-001 ...");
  mkdirSync(join(dir, ".tasks/dispatch"), { recursive: true });
  writeFileSync(join(dir, ".tasks/dispatch/send-1.md"), "hi");
  mkdirSync(join(dir, ".tasks/messages/outbox"), { recursive: true });
  writeFileSync(join(dir, ".tasks/messages/outbox/m1.json"), "{}");
  mkdirSync(join(dir, ".tasks/messages/receipts"), { recursive: true });
  writeFileSync(join(dir, ".tasks/messages/receipts/m1.json"), "{}");
}

describe("resetClaims", () => {
  it("writes an empty persisted claim lock", () => {
    resetClaims(dir);
    const state = JSON.parse(readFileSync(join(dir, ".tasks/orchestrator-state.json"), "utf-8"));
    expect(state.claimedTasks).toEqual([]);
    expect(state.taskClaimTimes).toEqual({});
  });
});

describe("wipeMission", () => {
  it("dry-run reports counts and changes nothing", () => {
    seed();
    const summary = wipeMission(dir, { dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.tasks).toBe(2);
    expect(summary.dispatchFiles).toBe(1);
    // still present
    expect(loadTasks(dir).length).toBe(2);
    expect(loadMission(dir)).not.toBeNull();
    expect(existsSync(join(dir, ".tasks/dispatch/send-1.md"))).toBe(true);
  });

  it("erases tasks, mission, dispatch queue, messaging store, and validation", () => {
    seed();
    const summary = wipeMission(dir);
    expect(summary.tasks).toBe(2);
    expect(loadTasks(dir).length).toBe(0);
    expect(loadMission(dir)).toBeNull();
    expect(existsSync(join(dir, ".tasks/dispatch/send-1.md"))).toBe(false);
    expect(existsSync(join(dir, ".tasks/messages/outbox/m1.json"))).toBe(false);
    expect(existsSync(join(dir, ".tasks/messages/receipts/m1.json"))).toBe(false);

    const val = loadValidationState(dir);
    expect(val!.assertions).toEqual({});
    expect(readFileSync(join(dir, ".tasks/validation-contract.md"), "utf-8")).toBe("");
    // claim lock reset to empty
    const claims = JSON.parse(readFileSync(join(dir, ".tasks/orchestrator-state.json"), "utf-8"));
    expect(claims.claimedTasks).toEqual([]);
  });

  it("leaves plans/ untouched unless --include-plans is given", () => {
    seed();
    mkdirSync(join(dir, "plans"), { recursive: true });
    writeFileSync(join(dir, "plans/design.md"), "plan");

    wipeMission(dir);
    expect(existsSync(join(dir, "plans/design.md"))).toBe(true);

    wipeMission(dir, { includePlans: true });
    expect(existsSync(join(dir, "plans/design.md"))).toBe(false);
  });

  it("truncates audit logs only under --hard", () => {
    seed();
    writeFileSync(join(dir, ".tasks/events.log"), "event\n");
    writeFileSync(join(dir, ".tasks/accounting.json"), '{"x":1}');

    wipeMission(dir);
    expect(existsSync(join(dir, ".tasks/events.log"))).toBe(true);

    wipeMission(dir, { hard: true });
    expect(existsSync(join(dir, ".tasks/events.log"))).toBe(false);
    expect(readFileSync(join(dir, ".tasks/accounting.json"), "utf-8")).toBe("{}");
  });
});
