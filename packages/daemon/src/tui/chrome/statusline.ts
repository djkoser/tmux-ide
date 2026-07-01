/**
 * The tmux-ide status bar — native chrome.
 *
 * Instead of wrapping or re-rendering tmux, tmux-ide renders itself INTO
 * tmux's own status line: `adoptSession` gives a session a second status row
 * whose content comes from `tmux-ide statusline` (invoked by tmux via `#()`
 * every `status-interval`). The row lists every project/session with a live
 * agent-state glyph and persists no matter which pane has focus — tmux draws
 * the chrome, so there's no nesting and the user's real sessions stay
 * untouched otherwise.
 *
 * `buildStatusline` is pure (tested); the io wrappers are thin.
 */
import { runTmux } from "@tmux-ide/tmux-bridge";
import type { AgentStatus } from "../detect/classify.ts";
import type { TeamProject } from "../team/projects.ts";

/** tmux style markup per status — chrome-row colors for the state glyphs. */
const STATUS_STYLE: Record<AgentStatus, string> = {
  blocked: "#[fg=colour203,bold]",
  working: "#[fg=colour221]",
  done: "#[fg=colour111]",
  idle: "#[fg=colour114]",
  unknown: "#[fg=colour244]",
};

const GLYPH: Record<AgentStatus, string> = {
  blocked: "●",
  working: "●",
  done: "●",
  idle: "●",
  unknown: "·",
};

/**
 * Build the status-bar string with tmux `#[...]` markup.
 *
 * One segment per entry: running projects show their rolled-up status glyph;
 * stopped registered projects show a muted `○`. The `active` session's
 * segment is highlighted (bold + underscore) so you can see where you are.
 * `maxItems` caps the segment count (tmux clips overflow anyway; capping
 * keeps the useful part visible).
 */
export function buildStatusline(
  projects: TeamProject[],
  active: string | null,
  maxItems = 12,
): string {
  const segments: string[] = [];
  for (const project of projects.slice(0, maxItems)) {
    const isActive =
      active !== null &&
      (project.name === active || project.sessions.some((s) => s.name === active));
    const glyph = project.running
      ? `${STATUS_STYLE[project.status]}${GLYPH[project.status]}#[default]`
      : "#[fg=colour240]○#[default]";
    const name = isActive
      ? `#[fg=colour231,bold,underscore]${project.name}#[default]`
      : project.running
        ? `#[fg=colour250]${project.name}#[default]`
        : `#[fg=colour240]${project.name}#[default]`;
    segments.push(`${glyph} ${name}`);
  }
  if (projects.length > maxItems) {
    segments.push(`#[fg=colour240]+${projects.length - maxItems}#[default]`);
  }
  const body = segments.join("  ");
  return `#[fg=colour75,bold] tmux-ide #[default] ${body}`;
}

/**
 * The root-table key that opens the floating switcher popup. Chosen to avoid
 * tmux defaults: `M-p` (Alt+p) is unbound by stock tmux, and — unlike prefix
 * `p` (previous-window) — it lives in the ROOT table so it fires without the
 * prefix from any adopted session. Alt-letter keys are directional/rare in
 * terminal apps, so grabbing one at the root is low-collision.
 */
export const POPUP_KEY = "M-p";

/**
 * PURE — the tmux argv that binds the popup key: `M-p` opens a `display-popup`
 * running the compact switcher, which `switch-client`s you to whatever you
 * pick and then exits (closing the popup).
 *
 * The bound command is just `<switcherCmd>` (default `tmux-ide switcher`). We
 * deliberately do NOT append `--client '#{client_name}'`: on tmux 3.6 a
 * `#{...}` format in a `display-popup -E` command argument is NOT expanded at
 * invocation (verified live — the literal string survives to the shell). The
 * switcher instead resolves its own invoking client from inside the popup via
 * `tmux display-message -p '#{client_name}'`, which DOES resolve correctly, and
 * switches with an explicit `-c <client>`.
 *
 * Bindings are SERVER-wide (there is no per-session `bind-key`), so this is a
 * global root-table bind — see the note on {@link unadoptSession}.
 */
export function popupBindCommand(switcherCmd = "tmux-ide switcher"): string[] {
  return [
    "bind-key",
    "-n",
    POPUP_KEY,
    "display-popup",
    "-E",
    "-w",
    "80%",
    "-h",
    "60%",
    switcherCmd,
  ];
}

/** PURE — the tmux argv that removes the popup key binding. */
export function popupUnbindCommand(): string[] {
  return ["unbind-key", "-n", POPUP_KEY];
}

/**
 * Adopt a session: add the chrome row (status line 2) that shells out to
 * `tmux-ide statusline` every 2s, and bind the popup key so `M-p` opens the
 * floating switcher from anywhere in the session. Status options are set
 * per-session (`-t`) so only adopted sessions change; the key bind is
 * server-wide (tmux has no per-session bind). `unadoptSession` reverses both.
 */
export function adoptSession(
  session: string,
  statuslineCmd = "tmux-ide statusline",
  switcherCmd = "tmux-ide switcher",
): void {
  const format = `#[align=left]#(${statuslineCmd} --active '#{session_name}')`;
  runTmux(["set-option", "-t", session, "status", "2"]);
  runTmux(["set-option", "-t", session, "status-interval", "2"]);
  runTmux(["set-option", "-t", session, "status-format[1]", format]);
  // Server-wide, idempotent (re-binding the same key just overwrites it).
  runTmux(popupBindCommand(switcherCmd));
}

/** Remove the chrome row from a session (revert to inherited options). */
export function unadoptSession(session: string): void {
  runTmux(["set-option", "-u", "-t", session, "status"]);
  runTmux(["set-option", "-u", "-t", session, "status-interval"]);
  runTmux(["set-option", "-u", "-t", session, "status-format[1]"]);
  // KNOWN SIMPLIFICATION: the popup key is a SERVER-wide bind, so unadopting
  // one session removes `M-p` for ALL adopted sessions. Acceptable for now —
  // best-effort so a missing bind (already unadopted) doesn't throw.
  try {
    runTmux(popupUnbindCommand());
  } catch {
    // no such key bound — nothing to undo
  }
}
