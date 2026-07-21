import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";

/**
 * Owner action items for one workspace: a durable list in .tasks/todos.json.
 * A lead posts an unblock item via `tmux-ide todo add`; the command center
 * aggregates every discovered workspace's list into one console panel.
 */

export interface TodoItem {
  id: string;
  text: string;
  createdAt: string;
  done: boolean;
  doneAt: string | null;
  /** Who posted the item: pane @ide_name/@ide_role when derivable, else "cli". */
  source: string;
}

function todosPath(dir: string): string {
  return join(dir, ".tasks", "todos.json");
}

function atomicWriteJSON(filePath: string, data: unknown): void {
  // Unique tmp per writer (messaging.ts convention): the CLI and the daemon can
  // write the same list at once; a shared tmp name lets the loser's rename fail.
  const tmpPath = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmpPath, filePath);
}

/** Load the workspace's todo list. Missing or unparseable file means empty. */
export function loadTodos(dir: string): TodoItem[] {
  const p = todosPath(dir);
  if (!existsSync(p)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(p, "utf-8"));
    return Array.isArray(raw) ? (raw as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(dir: string, todos: TodoItem[]): void {
  const tasksDir = join(dir, ".tasks");
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  atomicWriteJSON(todosPath(dir), todos);
}

export function addTodo(dir: string, text: string, source: string): TodoItem {
  const item: TodoItem = {
    id: randomUUID().slice(0, 8),
    text,
    createdAt: new Date().toISOString(),
    done: false,
    doneAt: null,
    source,
  };
  saveTodos(dir, [...loadTodos(dir), item]);
  return item;
}

/** Set an item's done state (stamping/clearing doneAt). Null if the id is unknown. */
export function setTodoDone(dir: string, id: string, done: boolean): TodoItem | null {
  const todos = loadTodos(dir);
  const item = todos.find((t) => t.id === id);
  if (!item) return null;
  item.done = done;
  item.doneAt = done ? new Date().toISOString() : null;
  saveTodos(dir, todos);
  return item;
}

/** Remove an item. False if the id is unknown. */
export function removeTodo(dir: string, id: string): boolean {
  const todos = loadTodos(dir);
  const remaining = todos.filter((t) => t.id !== id);
  if (remaining.length === todos.length) return false;
  saveTodos(dir, remaining);
  return true;
}
