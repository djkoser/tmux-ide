import { resolve } from "node:path";
import { readConfig } from "./lib/yaml-io.ts";
import { getSessionName } from "./lib/yaml-io.ts";
import { computeSizes } from "./lib/sizes.ts";
import {
  listSessionPanes,
  getWindowSize,
  resizePane,
  type PaneInfo,
} from "./widgets/lib/pane-comms.ts";
import { normalizePaneTitle } from "./lib/pane-title.ts";
import type { IdeConfig } from "./types.ts";
import { IdeError } from "./lib/errors.ts";

export interface ResizeInstruction {
  title: string;
  axis: "x" | "y";
  size: number;
}

/**
 * Index running panes by every label a relayout instruction might use.
 *
 * `@ide_name` (PaneInfo.name) is the authoritative, launch-stamped identity, so
 * it is keyed LAST and wins when a key collides with a title. The pane title is
 * an unreliable fallback: non-agent panes (e.g. team-input) let their shell
 * rename the title, and agent titles carry a leading busy glyph mid-turn — so
 * both the raw title and its glyph-stripped form are indexed too.
 */
export function buildPaneIndex(panes: PaneInfo[]): Map<string, string> {
  const idByLabel = new Map<string, string>();
  for (const p of panes) {
    if (p.title) {
      idByLabel.set(p.title, p.id);
      const stable = normalizePaneTitle(p.title);
      if (stable && stable !== p.title) idByLabel.set(stable, p.id);
    }
    if (p.name) idByLabel.set(p.name, p.id);
  }
  return idByLabel;
}

export interface ApplyRelayoutDeps {
  listPanes?: (session: string) => PaneInfo[];
  resize?: (paneId: string, axis: "x" | "y", size: number) => void;
}

/**
 * Compute the ide.yml-proportioned resize instructions for the given geometry
 * and apply each to its resolved pane. Shared by the `relayout` command and by
 * launch's end-of-creation sizing pass so both pin proportions identically.
 * Returns the instructions that resolved to a live pane and were applied.
 */
export function applyRelayout(
  config: IdeConfig,
  session: string,
  width: number,
  height: number,
  deps: ApplyRelayoutDeps = {},
): ResizeInstruction[] {
  const listPanes = deps.listPanes ?? listSessionPanes;
  const doResize = deps.resize ?? resizePane;

  const instructions = computeRelayout(config, width, height);
  const idByLabel = buildPaneIndex(listPanes(session));

  const applied: ResizeInstruction[] = [];
  for (const ins of instructions) {
    const paneId = idByLabel.get(ins.title);
    if (!paneId) continue;
    doResize(paneId, ins.axis, ins.size);
    applied.push(ins);
  }
  return applied;
}

/**
 * Re-pin pane proportions to ide.yml's `size:` fields.
 *
 * tmux computes splits once at creation, then redistributes on resize/re-attach
 * with its own algorithm. This recomputes each row's height and each pane's
 * width from the config (reusing computeSizes) and sets every row/pane but the
 * last, letting the last absorb the rounding remainder — the native equivalent
 * of relayout.sh's awk. Rows are addressed by their first pane's title.
 */
export function computeRelayout(
  config: IdeConfig,
  width: number,
  height: number,
): ResizeInstruction[] {
  const rows = config.rows ?? [];
  if (rows.length === 0) return [];
  const instructions: ResizeInstruction[] = [];

  // Row heights: set all but the last; the last row absorbs the remainder.
  const rowPercents = computeSizes(rows.map((r) => ({ size: r.size })));
  const usableH = height - (rows.length - 1) >= rows.length ? height - (rows.length - 1) : height;
  for (let i = 0; i < rows.length - 1; i++) {
    const lines = Math.max(1, Math.round((usableH * rowPercents[i]!) / 100));
    const title = rows[i]!.panes?.[0]?.title;
    if (title) instructions.push({ title, axis: "y", size: lines });
  }

  // Pane widths within each row: set all but the last; last absorbs the remainder.
  for (const row of rows) {
    const panes = row.panes ?? [];
    if (panes.length < 2) continue;
    const panePercents = computeSizes(panes.map((p) => ({ size: p.size })));
    const usableW = width - (panes.length - 1) >= panes.length ? width - (panes.length - 1) : width;
    for (let j = 0; j < panes.length - 1; j++) {
      const cols = Math.max(1, Math.round((usableW * panePercents[j]!) / 100));
      const title = panes[j]!.title;
      if (title) instructions.push({ title, axis: "x", size: cols });
    }
  }
  return instructions;
}

export async function relayout(
  targetDir: string | undefined,
  opts: { json?: boolean } = {},
): Promise<void> {
  const dir = resolve(targetDir ?? ".");
  const { config } = readConfig(dir);
  const { name: session } = getSessionName(dir);

  const size = getWindowSize(session);
  if (!size) {
    throw new IdeError(`Could not read window size for session "${session}".`, {
      code: "SESSION_NOT_FOUND",
    });
  }

  const applied = applyRelayout(config, session, size.width, size.height);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, session, applied }, null, 2));
  } else {
    console.log(`relayout: re-pinned ${applied.length} pane dimension(s) for "${session}"`);
  }
}
