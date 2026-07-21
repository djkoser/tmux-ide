import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { addTodo, loadTodos, setTodoDone, removeTodo } from "./lib/todo-store.ts";
import { IdeError } from "./lib/errors.ts";

interface TodoOptions {
  json?: boolean;
  sub?: string;
  args?: string[];
  /** Explicit source label; overrides pane derivation. */
  source?: string;
}

function runTmux(args: string[]): string {
  return execFileSync("tmux", args, { encoding: "utf-8" });
}

/**
 * Who is posting: the surrounding tmux pane's @ide_name (falling back to
 * @ide_role) when the command runs inside a pane, else null. Runner is
 * injectable so tests never execute tmux.
 */
export function derivePaneSource(run: (args: string[]) => string = runTmux): string | null {
  const paneId = process.env.TMUX_PANE;
  if (!paneId) return null;
  try {
    const name = run(["display-message", "-p", "-t", paneId, "#{@ide_name}"]).trim();
    if (name) return name;
    const role = run(["display-message", "-p", "-t", paneId, "#{@ide_role}"]).trim();
    return role || null;
  } catch {
    return null;
  }
}

/**
 * Owner action items for this workspace. `add` lets a lead post an unblock
 * item in one command; `list` renders the checkbox view (`--json` for
 * machines); `done`/`undone` toggle; `rm` deletes.
 */
export async function todoCommand(
  targetDir: string | undefined,
  opts: TodoOptions,
): Promise<void> {
  const dir = resolve(targetDir ?? ".");
  const { json, sub } = opts;
  const args = opts.args ?? [];

  switch (sub) {
    case "add": {
      const text = args.join(" ").trim();
      if (!text) {
        throw new IdeError('Missing text. Usage: tmux-ide todo add "text"', { code: "USAGE" });
      }
      const source = opts.source ?? derivePaneSource() ?? "cli";
      const item = addTodo(dir, text, source);
      if (json) console.log(JSON.stringify(item, null, 2));
      else console.log(`Added todo ${item.id}: ${item.text}`);
      return;
    }

    case "list": {
      const todos = loadTodos(dir);
      if (json) {
        console.log(JSON.stringify({ todos }, null, 2));
        return;
      }
      if (todos.length === 0) {
        console.log("No todos.");
        return;
      }
      for (const t of todos) {
        console.log(`[${t.done ? "x" : " "}] ${t.id}  ${t.text}  (${t.source})`);
      }
      return;
    }

    case "done":
    case "undone": {
      const id = args[0];
      if (!id) {
        throw new IdeError(`Missing id. Usage: tmux-ide todo ${sub} <id>`, { code: "USAGE" });
      }
      const item = setTodoDone(dir, id, sub === "done");
      if (!item) throw new IdeError(`No todo "${id}"`, { code: "NOT_FOUND" });
      if (json) console.log(JSON.stringify(item, null, 2));
      else console.log(`Marked ${item.id} ${sub}: ${item.text}`);
      return;
    }

    case "rm": {
      const id = args[0];
      if (!id) {
        throw new IdeError("Missing id. Usage: tmux-ide todo rm <id>", { code: "USAGE" });
      }
      if (!removeTodo(dir, id)) throw new IdeError(`No todo "${id}"`, { code: "NOT_FOUND" });
      if (json) console.log(JSON.stringify({ ok: true, removed: id }, null, 2));
      else console.log(`Removed ${id}`);
      return;
    }

    default:
      throw new IdeError("Usage: tmux-ide todo <add|list|done|undone|rm> [args] [--json]", {
        code: "USAGE",
      });
  }
}
