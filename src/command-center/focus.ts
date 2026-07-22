import { execFileSync } from "node:child_process";

/**
 * Raise the macOS terminal window attached to a tmux session.
 *
 * The terminal app is identified from the session's TERM_PROGRAM environment
 * (stamped by the attaching terminal). Window titles are listed via System
 * Events and matched in-process: a boundary-aware match first (so a session
 * named "team" never grabs "team_3"'s window), then a plain substring
 * fallback. The chosen window is raised by index, falling back to plain app
 * activation when no window matches or accessibility scripting is
 * unavailable. All command execution goes through an injectable runner so
 * tests never run tmux or osascript.
 */

export type FocusRunner = (cmd: string, args: string[]) => string;

export interface FocusResult {
  ok: boolean;
  app?: string;
  /** Raised window's title, or null when only the app could be activated. */
  window?: string | null;
  error?: string;
}

const TERM_PROGRAM_APPS: Record<string, { app: string; process: string }> = {
  "iTerm.app": { app: "iTerm", process: "iTerm2" },
  Apple_Terminal: { app: "Terminal", process: "Terminal" },
  ghostty: { app: "Ghostty", process: "Ghostty" },
  WezTerm: { app: "WezTerm", process: "wezterm-gui" },
  vscode: { app: "Visual Studio Code", process: "Code" },
};

const realRunner: FocusRunner = (cmd, args) => execFileSync(cmd, args, { encoding: "utf-8" });

/** Strip characters that could break out of an AppleScript string literal. */
function scriptSafe(value: string): string {
  return value.replace(/[\\"]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** TERM_PROGRAM from one tmux environment scope ("" when unset/errored). */
function readTermProgram(run: FocusRunner, scope: string[]): string {
  try {
    const out = run("tmux", ["show-environment", ...scope, "TERM_PROGRAM"]).trim();
    return out.startsWith("TERM_PROGRAM=") ? out.slice("TERM_PROGRAM=".length) : "";
  } catch {
    return "";
  }
}

/**
 * Pick the window whose title carries the session name. Session names can be
 * prefixes of each other (team, team_2), so titles where the name is followed
 * or preceded by an identifier character are rejected first; a plain
 * substring match is the fallback when no boundary match exists.
 */
export function matchWindowIndex(names: string[], session: string): number {
  const boundary = new RegExp(
    `(^|[^A-Za-z0-9_-])${escapeRegExp(session)}($|[^A-Za-z0-9_-])`,
  );
  const boundaryIdx = names.findIndex((n) => boundary.test(n));
  if (boundaryIdx !== -1) return boundaryIdx;
  return names.findIndex((n) => n.includes(session));
}

export function focusSessionWindow(session: string, run: FocusRunner = realRunner): FocusResult {
  let hasClient: boolean;
  try {
    hasClient = run("tmux", ["list-clients", "-t", session, "-F", "#{client_tty}"]).trim() !== "";
  } catch {
    return { ok: false, error: `tmux session "${session}" not reachable` };
  }

  // TERM_PROGRAM is not in tmux's default update-environment list, so the
  // session scope usually lacks it; the server's global environment (seeded
  // from the terminal that started tmux) is the reliable fallback.
  let termProgram = readTermProgram(run, ["-t", session]);
  if (!termProgram) termProgram = readTermProgram(run, ["-g"]);

  const terminal = TERM_PROGRAM_APPS[termProgram];
  if (!terminal) {
    return {
      ok: false,
      error: hasClient
        ? `unrecognized terminal (TERM_PROGRAM=${termProgram || "unset"})`
        : "no attached client and no recognizable terminal",
    };
  }

  try {
    run("osascript", ["-e", `tell application "${terminal.app}" to activate`]);
  } catch {
    return { ok: false, app: terminal.app, error: `could not activate ${terminal.app}` };
  }

  // Best effort: list window titles, match the session in-process, and raise
  // the matched window by index. Any failure here (no accessibility
  // permission, no matching window) leaves the app activation as the result.
  const listScript = [
    `tell application "System Events" to tell process "${scriptSafe(terminal.process)}"`,
    "  set nameList to name of every window",
    "end tell",
    "set {tid, text item delimiters} to {text item delimiters, linefeed}",
    "set joined to nameList as text",
    "set text item delimiters to tid",
    "return joined",
  ].join("\n");

  let names: string[];
  try {
    names = run("osascript", ["-e", listScript]).replace(/\n$/, "").split("\n");
  } catch {
    return { ok: true, app: terminal.app, window: null };
  }

  const idx = matchWindowIndex(names, session);
  if (idx === -1) {
    return { ok: true, app: terminal.app, window: null };
  }

  const raiseScript = [
    `tell application "System Events" to tell process "${scriptSafe(terminal.process)}"`,
    `  perform action "AXRaise" of window ${idx + 1}`,
    "end tell",
  ].join("\n");

  try {
    run("osascript", ["-e", raiseScript]);
    return { ok: true, app: terminal.app, window: names[idx] ?? null };
  } catch {
    return { ok: true, app: terminal.app, window: null };
  }
}
