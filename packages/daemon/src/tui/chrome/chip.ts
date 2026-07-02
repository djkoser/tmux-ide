/**
 * Per-pane agent chips — the border label rendered INSIDE an adopted session.
 *
 * Where the status bar ({@link ./statusline.ts}) shows the fleet rollup (one
 * glyph per session), a chip shows per-PANE truth: what agent is running in
 * THIS pane and its live state — `claude · working`, `codex · blocked`. The
 * updater writes each adopted pane's chip into a `@tmux_ide_chip` pane option
 * and `adoptSession` points `pane-border-format` at it (falling back to the
 * pane title when empty). `paneChip` is pure (tested); the io lives in the
 * updater.
 */
import type { AgentStatus } from "../detect/classify.ts";

/**
 * tmux style markup per status — mirrors the bar's state colors
 * ({@link ./statusline.ts} STATUS_STYLE) so a pane chip reads the same as its
 * session's rollup glyph. Kept inline (not imported) so this module stays pure
 * and dependency-free for testing.
 */
const CHIP_STYLE: Record<AgentStatus, string> = {
  blocked: "#[fg=colour203,bold]",
  working: "#[fg=colour221]",
  done: "#[fg=colour111]",
  idle: "#[fg=colour114]",
  unknown: "#[fg=colour244]",
};

/**
 * PURE — build a pane's chip string with tmux `#[...]` markup, or `""` for a
 * non-agent pane (`agent === null`, e.g. a raw shell). An empty chip clears the
 * pane option so the border format falls back to the pane title. The chip is
 * `<agent> · <status>` styled to match the bar's state color.
 */
export function paneChip(agent: string | null, status: AgentStatus): string {
  if (!agent) return "";
  return `${CHIP_STYLE[status]}${agent} · ${status}#[default]`;
}
