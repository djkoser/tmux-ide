import { resolve } from "node:path";
import { readConfig } from "./lib/yaml-io.ts";
import { getSessionName } from "./lib/yaml-io.ts";
import { computeSizes } from "./lib/sizes.ts";
import {
  listSessionPanes,
  getWindowSize,
  resizePane,
} from "./widgets/lib/pane-comms.ts";
import type { IdeConfig } from "./types.ts";
import { IdeError } from "./lib/errors.ts";

export interface ResizeInstruction {
  title: string;
  axis: "x" | "y";
  size: number;
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
export function computeRelayout(config: IdeConfig, width: number, height: number): ResizeInstruction[] {
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

  const instructions = computeRelayout(config, size.width, size.height);
  const panes = listSessionPanes(session);
  const idByLabel = new Map<string, string>();
  for (const p of panes) {
    if (p.name) idByLabel.set(p.name, p.id);
    idByLabel.set(p.title, p.id);
  }

  const applied: ResizeInstruction[] = [];
  for (const ins of instructions) {
    const paneId = idByLabel.get(ins.title);
    if (!paneId) continue;
    resizePane(paneId, ins.axis, ins.size);
    applied.push(ins);
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, session, applied }, null, 2));
  } else {
    console.log(`relayout: re-pinned ${applied.length} pane dimension(s) for "${session}"`);
  }
}
