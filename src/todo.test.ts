import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { todoCommand, derivePaneSource } from "./todo.ts";
import { addTodo, loadTodos } from "./lib/todo-store.ts";
import { IdeError } from "./lib/errors.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-todo-cli-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function captureLogs(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  return { logs, restore: () => (console.log = original) };
}

async function run(sub: string | undefined, args: string[] = [], json = false): Promise<string[]> {
  const { logs, restore } = captureLogs();
  try {
    await todoCommand(dir, { sub, args, json, source: "test" });
  } finally {
    restore();
  }
  return logs;
}

describe("todo add / list", () => {
  it("adds an item and lists it with checkbox state and source", async () => {
    await run("add", ["approve", "the", "deploy"]);
    const logs = await run("list");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("[ ]");
    expect(logs[0]).toContain("approve the deploy");
    expect(logs[0]).toContain("(test)");
  });

  it("list --json is machine-parseable", async () => {
    const item = addTodo(dir, "json me", "lead");
    const logs = await run("list", [], true);
    const parsed = JSON.parse(logs.join("\n")) as { todos: { id: string; text: string }[] };
    expect(parsed.todos.map((t) => t.id)).toEqual([item.id]);
  });

  it("reports an empty list", async () => {
    expect(await run("list")).toEqual(["No todos."]);
  });

  it("rejects add without text", async () => {
    await expect(todoCommand(dir, { sub: "add", args: [] })).rejects.toBeInstanceOf(IdeError);
  });
});

describe("todo done / undone / rm", () => {
  it("toggles done and back", async () => {
    const item = addTodo(dir, "toggle", "lead");
    await run("done", [item.id]);
    expect(loadTodos(dir)[0]!.done).toBe(true);
    const logs = await run("list");
    expect(logs[0]).toContain("[x]");

    await run("undone", [item.id]);
    expect(loadTodos(dir)[0]!.done).toBe(false);
  });

  it("removes an item", async () => {
    const item = addTodo(dir, "drop", "lead");
    await run("rm", [item.id]);
    expect(loadTodos(dir)).toEqual([]);
  });

  it("rejects unknown ids and missing args", async () => {
    await expect(todoCommand(dir, { sub: "done", args: ["nope"] })).rejects.toBeInstanceOf(
      IdeError,
    );
    await expect(todoCommand(dir, { sub: "rm", args: [] })).rejects.toBeInstanceOf(IdeError);
    await expect(todoCommand(dir, { sub: "bogus", args: [] })).rejects.toBeInstanceOf(IdeError);
  });
});

describe("derivePaneSource", () => {
  const originalPane = process.env.TMUX_PANE;

  afterEach(() => {
    if (originalPane === undefined) delete process.env.TMUX_PANE;
    else process.env.TMUX_PANE = originalPane;
  });

  it("returns null outside a tmux pane", () => {
    delete process.env.TMUX_PANE;
    expect(derivePaneSource(() => "lead")).toBeNull();
  });

  it("prefers @ide_name, falls back to @ide_role, then null", () => {
    process.env.TMUX_PANE = "%1";
    expect(derivePaneSource(() => "cw1\n")).toBe("cw1");

    const roleOnly = (args: string[]): string => (args.includes("#{@ide_name}") ? "" : "lead\n");
    expect(derivePaneSource(roleOnly)).toBe("lead");

    expect(derivePaneSource(() => "")).toBeNull();
  });

  it("returns null when tmux errors", () => {
    process.env.TMUX_PANE = "%1";
    expect(
      derivePaneSource(() => {
        throw new Error("no server");
      }),
    ).toBeNull();
  });
});
