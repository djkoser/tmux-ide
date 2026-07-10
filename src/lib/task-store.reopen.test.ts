import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveTask, loadTask, reopenTask, ensureTasksDir } from "./task-store.ts";
import { makeTask } from "../__tests__/support.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-reopen-test-"));
  ensureTasksDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("reopenTask", () => {
  it("reopens a reviewed task to todo, preserving the assignee", () => {
    saveTask(
      dir,
      makeTask({ id: "001", status: "review", assignee: "cw3", retryCount: 0, lastError: "boom" }),
    );

    const result = reopenTask(dir, "001");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("reopen");
    expect(result!.retryCount).toBe(1);

    const reloaded = loadTask(dir, "001")!;
    expect(reloaded.status).toBe("todo");
    expect(reloaded.assignee).toBe("cw3"); // ownership kept
    expect(reloaded.lastError).toBeNull(); // cleared to avoid a double retry
    expect(reloaded.nextRetryAt).toBeNull();
    expect(reloaded.retryCount).toBe(1);
  });

  it("increments retryCount across successive reopens", () => {
    saveTask(dir, makeTask({ id: "002", status: "review", assignee: "cw2", retryCount: 0 }));
    expect(reopenTask(dir, "002")!.retryCount).toBe(1);
    // simulate the writer re-submitting to review, then failing again
    const t = loadTask(dir, "002")!;
    t.status = "review";
    saveTask(dir, t);
    expect(reopenTask(dir, "002")!.retryCount).toBe(2);
  });

  it("escalates instead of reopening once the retry cap is reached", () => {
    saveTask(
      dir,
      makeTask({ id: "003", status: "review", assignee: "cw4", retryCount: 4, maxRetries: 5 }),
    );

    const result = reopenTask(dir, "003");
    expect(result!.action).toBe("escalate");
    expect(result!.retryCount).toBe(5);

    const reloaded = loadTask(dir, "003")!;
    expect(reloaded.status).toBe("review"); // left in review for the Lead
    expect(reloaded.assignee).toBe("cw4");
    expect(reloaded.lastError).toBeNull();
  });

  it("honors a maxRetries override", () => {
    saveTask(dir, makeTask({ id: "004", status: "review", assignee: "cw1", retryCount: 1 }));
    expect(reopenTask(dir, "004", 2)!.action).toBe("escalate");
  });

  it("returns null for an unknown task", () => {
    expect(reopenTask(dir, "999")).toBeNull();
  });
});
