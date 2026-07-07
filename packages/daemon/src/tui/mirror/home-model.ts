/**
 * The HOME panel's row model (M21.9) — PURE so it unit-tests without OpenTUI.
 *
 * Home used to be a flat list of live sessions; now it is a list of ITEMS:
 * every live session (unchanged, first), then — when the project registry has
 * projects with no live session — a section header followed by one launchable
 * row per registered-but-not-running project. That surfaces the registry as a
 * mouse-first "open project" affordance: clicking (or pressing enter on) a
 * project row launches a detached session in its dir and opens it as the
 * workspace.
 *
 * The item list is what the render walks AND what the router's `gy - 2` row
 * math indexes, so selection/hover/click all share one geometry. Headers are
 * not selectable; the step/clamp helpers keep the keyboard selection on real
 * rows without the app hand-rolling skip loops.
 */
import type { AgentStatus } from "../detect/classify.ts";

/** A live tmux session row — click/enter opens it as the workspace. */
export interface HomeSessionItem {
  kind: "session";
  session: string;
  project: string;
  status: AgentStatus;
  windows: number;
  dir: string | null;
}
/** A registered project with no live session — click/enter launches it. */
export interface HomeProjectItem {
  kind: "project";
  name: string;
  dir: string | null;
}
/** A non-selectable section label between the sessions and the registry. */
export interface HomeHeaderItem {
  kind: "header";
  label: string;
}
export type HomeItem = HomeSessionItem | HomeProjectItem | HomeHeaderItem;

/** The slice of the `tmux-ide team --json` payload this model reads (kept
 *  structural so the app's locally-declared fleet shape satisfies it). */
export interface HomeFleetProject {
  name: string;
  dir: string | null;
  registered: boolean;
  running: boolean;
  sessions: Array<{
    name: string;
    status: AgentStatus;
    windows: Array<unknown>;
  }>;
}

export const REGISTRY_HEADER_LABEL = "registered projects — not running";

/** PURE — the ordered home items: every project's live sessions first (the
 *  exact rows home always showed), then a header + one row per registered
 *  project that has no live session. */
export function buildHomeItems(projects: readonly HomeFleetProject[]): HomeItem[] {
  const items: HomeItem[] = [];
  for (const p of projects) {
    for (const s of p.sessions) {
      items.push({
        kind: "session",
        session: s.name,
        project: p.name,
        status: s.status,
        windows: s.windows.length,
        dir: p.dir,
      });
    }
  }
  const idle = projects.filter((p) => p.registered && !p.running);
  if (idle.length > 0) {
    items.push({ kind: "header", label: REGISTRY_HEADER_LABEL });
    for (const p of idle) items.push({ kind: "project", name: p.name, dir: p.dir });
  }
  return items;
}

/** PURE — whether an item takes selection / clicks as a row. */
export function isSelectable(item: HomeItem | undefined): boolean {
  return item !== undefined && item.kind !== "header";
}

/** PURE — clamp a selection index onto a selectable item: into range first,
 *  then the nearest selectable at-or-above, falling back downward. Returns 0
 *  for an empty list (matching the old `Math.min(sel, len - 1)` behavior). */
export function clampSelectable(items: readonly HomeItem[], sel: number): number {
  if (items.length === 0) return 0;
  const start = Math.max(0, Math.min(sel, items.length - 1));
  for (let i = start; i < items.length; i++) if (isSelectable(items[i])) return i;
  for (let i = start - 1; i >= 0; i--) if (isSelectable(items[i])) return i;
  return 0;
}

/** PURE — move the selection one selectable row in `delta`'s direction (±1),
 *  skipping headers; stays put at either end. */
export function stepSelectable(items: readonly HomeItem[], from: number, delta: 1 | -1): number {
  for (let i = from + delta; i >= 0 && i < items.length; i += delta) {
    if (isSelectable(items[i])) return i;
  }
  return from;
}

/** PURE — a tmux-legal session name for a project: tmux forbids `:` and `.`
 *  in session names (target syntax), and spaces only invite quoting bugs —
 *  all collapse to `-`. */
export function sessionNameFor(project: string): string {
  return project.replace(/[.:\s]+/g, "-");
}

/** PURE — whether a user-typed session name is directly usable. */
export function isValidSessionName(name: string): boolean {
  return name.length > 0 && !/[.:\s]/.test(name);
}
