import { resolve, join } from "node:path";
import { existsSync, lstatSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { IdeError } from "./lib/errors.ts";

export interface LinkResult {
  store: string;
  linked: string[];
}

/**
 * Point each target directory's `.tasks` at the root task store via symlink so
 * a main checkout and its git worktrees share one board (dispatch pointers
 * resolve from every cwd). A stale real `.tasks` dir at a target is replaced —
 * leaving it would silently desync that worktree onto an old board.
 *
 * The reusable core of setup-team.sh's symlink work; the turf-specific worktree
 * topology stays in that script.
 */
export function linkTasks(rootDir: string, targets: string[]): LinkResult {
  const store = resolve(rootDir, ".tasks");
  if (!existsSync(store)) mkdirSync(store, { recursive: true });

  const linked: string[] = [];
  for (const target of targets) {
    const targetDir = resolve(target);
    if (!existsSync(targetDir)) {
      throw new IdeError(`tasks link: target directory does not exist: ${targetDir}`, {
        code: "NOT_FOUND",
      });
    }
    const link = join(targetDir, ".tasks");
    if (existsSync(link) || isSymlink(link)) {
      // Replace a stale real dir or an existing/broken symlink.
      rmSync(link, { recursive: true, force: true });
    }
    symlinkSync(store, link);
    linked.push(link);
  }
  return { store, linked };
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function tasksCommand(
  targetDir: string | undefined,
  opts: { json?: boolean; sub?: string; args: string[] },
): Promise<void> {
  const { sub, args, json } = opts;
  if (sub !== "link") {
    throw new IdeError("Usage: tmux-ide tasks link <target-dir>...", { code: "USAGE" });
  }
  if (args.length === 0) {
    throw new IdeError("Usage: tmux-ide tasks link <target-dir>...", { code: "USAGE" });
  }
  const result = linkTasks(resolve(targetDir ?? "."), args);
  if (json) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } else {
    console.log(`Linked ${result.linked.length} checkout(s) to ${result.store}:`);
    for (const l of result.linked) console.log(`  ${l}`);
  }
}
