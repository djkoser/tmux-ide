import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, existsSync, lstatSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkTasks } from "./tasks-link.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tmux-ide-link-test-"));
  mkdirSync(join(root, ".tasks"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("linkTasks", () => {
  it("symlinks a worktree's .tasks to the root store", () => {
    const wt = join(root, "wt");
    mkdirSync(wt, { recursive: true });
    const result = linkTasks(root, [wt]);

    const link = join(wt, ".tasks");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(result.linked).toContain(link);
    // writes through the link resolve to the shared store
    writeFileSync(join(link, "probe.txt"), "shared");
    expect(readFileSync(join(root, ".tasks/probe.txt"), "utf-8")).toBe("shared");
  });

  it("replaces a stale real .tasks directory with the shared symlink", () => {
    const wt = join(root, "wt");
    mkdirSync(join(wt, ".tasks"), { recursive: true });
    writeFileSync(join(wt, ".tasks/old.json"), "stale");

    linkTasks(root, [wt]);
    const link = join(wt, ".tasks");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(existsSync(join(link, "old.json"))).toBe(false); // stale board gone
  });

  it("links multiple targets to the same store", () => {
    const a = join(root, "a");
    const b = join(root, "b");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const result = linkTasks(root, [a, b]);
    expect(result.linked.length).toBe(2);
    expect(lstatSync(join(a, ".tasks")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(b, ".tasks")).isSymbolicLink()).toBe(true);
  });

  it("is idempotent — re-linking an already-linked target keeps the symlink", () => {
    const wt = join(root, "wt");
    mkdirSync(wt, { recursive: true });
    linkTasks(root, [wt]);
    linkTasks(root, [wt]);
    expect(lstatSync(join(wt, ".tasks")).isSymbolicLink()).toBe(true);
  });

  it("throws for a non-existent target", () => {
    expect(() => linkTasks(root, [join(root, "nope")])).toThrow();
  });
});
