import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addTodo, loadTodos, setTodoDone, removeTodo } from "./todo-store.ts";

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
