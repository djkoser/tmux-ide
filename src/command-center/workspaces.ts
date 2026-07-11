import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { workspaceEntrySchema } from "./schemas.ts";

export type WorkspaceEntry = z.infer<typeof workspaceEntrySchema>;

export interface WorkspaceRegistry {
  version: number;
  workspaces: WorkspaceEntry[];
}

const EMPTY: WorkspaceRegistry = { version: 1, workspaces: [] };

/** Default registry path: ~/.tmux-ide/workspaces.json (written by new-workspace.sh). */
export function defaultRegistryPath(): string {
  return join(homedir(), ".tmux-ide", "workspaces.json");
}

/**
 * Read the workspace registry, tolerating a missing, empty, or corrupt file
 * (returns zero workspaces rather than throwing). Malformed individual entries
 * are dropped while valid ones survive, so one bad row can't hide the rest.
 * The writer does an atomic temp+rename, so a poll never sees a partial file.
 */
export function loadWorkspaceRegistry(path = defaultRegistryPath()): WorkspaceRegistry {
  if (!existsSync(path)) return EMPTY;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return EMPTY;
  }
  if (!raw || typeof raw !== "object") return EMPTY;
  const obj = raw as { version?: unknown; workspaces?: unknown };
  const version = typeof obj.version === "number" ? obj.version : 1;
  const list = Array.isArray(obj.workspaces) ? obj.workspaces : [];
  // Keep valid entries, drop malformed ones. flatMap + the `.success` discriminant
  // narrows without naming zod's SafeParse result type (renamed across zod versions).
  const workspaces = list
    .map((entry) => workspaceEntrySchema.safeParse(entry))
    .flatMap((r) => (r.success ? [r.data] : []));
  return { version, workspaces };
}
