/**
 * Two Shiki themes derived from the dashboard's TUI palette
 * (--theme-* / --ansi-* tokens). They are registered with the @pierre/diffs
 * highlighter via `registerCustomCSSVariableTheme`, which produces a
 * Shiki CSS-variables theme: each TextMate scope becomes a `--diffs-<scope>`
 * CSS variable on the rendered DOM, falling back to the per-scope default
 * declared here when the consumer page hasn't overridden it.
 *
 * Defaults are concrete colors (so unstyled rendering still looks right);
 * dashboards that want palette-perfect highlighting can override the
 * `--diffs-<scope>` variables in globals.css later (T03 territory).
 */

import { registerCustomCSSVariableTheme } from "@pierre/diffs";

export const TUI_DARK = "tui-dark";
export const TUI_LIGHT = "tui-light";

/**
 * Map of TextMate scope groups → `var(--ansi-*) || hex` CSS expression.
 * Keys are the scope names that Shiki's `createCssVariablesTheme` walks.
 * Values are CSS color expressions used as `--diffs-<scope>` defaults.
 */
const tuiDarkDefaults: Record<string, string> = {
  fg: "var(--theme-text, #e6e6e6)",
  bg: "var(--theme-background, #0d0d0d)",
  keyword: "var(--ansi-magenta, #c678dd)",
  string: "var(--ansi-green, #98c379)",
  comment: "var(--ansi-bright-black, #5c6370)",
  function: "var(--ansi-blue, #61afef)",
  number: "var(--ansi-yellow, #d19a66)",
  type: "var(--ansi-cyan, #56b6c2)",
  variable: "var(--theme-text, #e6e6e6)",
  constant: "var(--ansi-yellow, #d19a66)",
  punctuation: "var(--ansi-white, #abb2bf)",
};

const tuiLightDefaults: Record<string, string> = {
  fg: "var(--theme-text, #1a1a1a)",
  bg: "var(--theme-background, #ffffff)",
  keyword: "var(--ansi-magenta, #a626a4)",
  string: "var(--ansi-green, #50a14f)",
  comment: "var(--ansi-bright-black, #a0a1a7)",
  function: "var(--ansi-blue, #4078f2)",
  number: "var(--ansi-yellow, #c18401)",
  type: "var(--ansi-cyan, #0184bc)",
  variable: "var(--theme-text, #1a1a1a)",
  constant: "var(--ansi-yellow, #c18401)",
  punctuation: "var(--ansi-white, #383a42)",
};

let registered = false;

/**
 * Idempotent. Registers `tui-dark` and `tui-light` with the @pierre/diffs
 * highlighter on first call. Safe to call from a render path; subsequent
 * calls are no-ops.
 */
export function registerTuiThemes(): void {
  if (registered) return;
  registered = true;
  registerCustomCSSVariableTheme(TUI_DARK, tuiDarkDefaults);
  registerCustomCSSVariableTheme(TUI_LIGHT, tuiLightDefaults);
}
