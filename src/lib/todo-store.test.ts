import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { addTodo, loadTodos, setTodoDone, removeTodo } from "./todo-store.ts";

const execFileAsync = promisify(execFile);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-todo-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("addTodo / loadTodos", () => {
  it("persists an item with id, text, source, createdAt and not-done state", () => {
    const item = addTodo(dir, "unblock: approve the deploy", "lead");
    expect(item.id).toHaveLength(8);
    expect(item.done).toBe(false);
    expect(item.doneAt).toBeNull();

    const loaded = loadTodos(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(item);
  });

  it("appends without dropping existing items", () => {
    const a = addTodo(dir, "first", "lead");
    const b = addTodo(dir, "second", "cw1");
    expect(loadTodos(dir).map((t) => t.id)).toEqual([a.id, b.id]);
  });

  it("returns empty for a workspace with no todos file", () => {
    expect(loadTodos(dir)).toEqual([]);
  });

  it("returns empty for a corrupt or non-array todos file", () => {
    mkdirSync(join(dir, ".tasks"), { recursive: true });
    writeFileSync(join(dir, ".tasks", "todos.json"), "{ not json");
    expect(loadTodos(dir)).toEqual([]);
    writeFileSync(join(dir, ".tasks", "todos.json"), '{"todos": []}');
    expect(loadTodos(dir)).toEqual([]);
  });

  it("leaves no stray .tmp files after writes", () => {
    addTodo(dir, "a", "lead");
    addTodo(dir, "b", "lead");
    const leftovers = readdirSync(join(dir, ".tasks")).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });
});

describe("setTodoDone", () => {
  it("marks done with a doneAt stamp and back to undone clearing it", () => {
    const item = addTodo(dir, "toggle me", "lead");

    const done = setTodoDone(dir, item.id, true);
    expect(done!.done).toBe(true);
    expect(done!.doneAt).not.toBeNull();
    expect(loadTodos(dir)[0]!.done).toBe(true);

    const undone = setTodoDone(dir, item.id, false);
    expect(undone!.done).toBe(false);
    expect(undone!.doneAt).toBeNull();
    expect(loadTodos(dir)[0]!.done).toBe(false);
  });

  it("returns null for an unknown id without touching the store", () => {
    addTodo(dir, "keep", "lead");
    expect(setTodoDone(dir, "nope", true)).toBeNull();
    expect(loadTodos(dir)).toHaveLength(1);
  });
});

describe("removeTodo", () => {
  it("removes exactly the given item", () => {
    const a = addTodo(dir, "keep", "lead");
    const b = addTodo(dir, "drop", "lead");
    expect(removeTodo(dir, b.id)).toBe(true);
    expect(loadTodos(dir).map((t) => t.id)).toEqual([a.id]);
  });

  it("returns false for an unknown id", () => {
    expect(removeTodo(dir, "nope")).toBe(false);
    expect(existsSync(join(dir, ".tasks", "todos.json"))).toBe(false);
  });
});

describe("cross-process concurrency (whole-list read-modify-write)", () => {
  it("toggles and adds racing another process's adds lose no change", async () => {
    const seeded = addTodo(dir, "toggle me", "lead");
    const COUNT = 200;

    // A second real process hammers adds against the same store while this
    // process adds and toggles in a tight loop — without the lock, either
    // side's whole-list write silently drops the other's changes.
    const storePath = new URL("./todo-store.ts", import.meta.url).pathname;
    const script = [
      `const { addTodo } = await import(${JSON.stringify(storePath)});`,
      `const dir = ${JSON.stringify(dir)};`,
      `for (let i = 0; i < ${COUNT}; i++) addTodo(dir, "child-" + i, "cli");`,
    ].join("\n");
    const child = execFileAsync("bun", ["-e", script]);

    // Wait for the child's first write so the tight loops genuinely overlap.
    while (!loadTodos(dir).some((t) => t.text === "child-0")) {
      await new Promise((r) => setTimeout(r, 2));
    }

    let lastDone = false;
    for (let i = 0; i < COUNT; i++) {
      addTodo(dir, `main-${i}`, "lead");
      lastDone = i % 2 === 0;
      setTodoDone(dir, seeded.id, lastDone);
    }
    await child;

    const todos = loadTodos(dir);
    expect(todos.filter((t) => t.text.startsWith("child-"))).toHaveLength(COUNT);
    expect(todos.filter((t) => t.text.startsWith("main-"))).toHaveLength(COUNT);
    expect(todos.find((t) => t.id === seeded.id)!.done).toBe(lastDone);
  }, 30_000);

  it("breaks a stale lock left by a crashed holder", () => {
    const lock = join(dir, ".tasks", "todos.json.lock");
    mkdirSync(lock, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);

    const item = addTodo(dir, "proceeds past the stale lock", "lead");
    expect(loadTodos(dir).map((t) => t.id)).toContain(item.id);
    expect(existsSync(lock)).toBe(false);
  });

  it("leaves no lock directory behind after normal operations", () => {
    const item = addTodo(dir, "hygiene", "lead");
    setTodoDone(dir, item.id, true);
    removeTodo(dir, item.id);
    expect(existsSync(join(dir, ".tasks", "todos.json.lock"))).toBe(false);
  });
});
