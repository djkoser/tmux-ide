/**
 * Pane-title normalization shared across the orchestrator (agent detection),
 * send (wildcard matching), and relayout (pane resolution).
 *
 * Claude Code and Codex prepend a spinner/status glyph to the pane title while
 * busy (e.g. "⠋ cw2"). Stripping it yields the stable configured name so a pane
 * resolves the same whether it's idle or mid-turn.
 */
/** Leading busy/spinner glyph a Claude/Codex pane shows while working. */
export const SPINNERS = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠂⠒⠢⠆⠐⠠⠄◐◓◑◒✳|/\\-] /;

/** Strip a leading busy/spinner glyph from a pane title to get its stable name. */
export function normalizePaneTitle(title: string): string {
  return title.replace(SPINNERS, "").trim();
}
