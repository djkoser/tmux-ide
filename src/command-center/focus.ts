import { execFileSync } from "node:child_process";

/**
 * Raise the macOS terminal window attached to a tmux session.
 *
 * The terminal app is identified from the session's TERM_PROGRAM environment
 * (stamped by the attaching terminal); the window is matched by session name
 * via System Events, falling back to plain app activation when no window
 * matches or accessibility scripting is unavailable. All command execution
 * goes through an injectable runner so tests never run tmux or osascript.
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

export function focusSessionWindow(session: string, run: FocusRunner = realRunner): FocusResult {
  let hasClient: boolean;
  try {
    hasClient = run("tmux", ["list-clients", "-t", session, "-F", "#{client_tty}"]).trim() !== "";
  } catch {
    return { ok: false, error: `tmux session "${session}" not reachable` };
  }

  let termProgram = "";
  try {
    const out = run("tmux", ["show-environment", "-t", session, "TERM_PROGRAM"]).trim();
    if (out.startsWith("TERM_PROGRAM=")) termProgram = out.slice("TERM_PROGRAM=".length);
  } catch {
    // TERM_PROGRAM unset for this session
  }

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

  // Best effort: raise the window whose title carries the session name. Any
  // failure here (no accessibility permission, no matching window) leaves the
  // app activation as the result.
  const raiseScript = [
    `tell application "System Events" to tell process "${scriptSafe(terminal.process)}"`,
    "  repeat with w in windows",
    `    if name of w contains "${scriptSafe(session)}" then`,
    '      perform action "AXRaise" of w',
    "      return name of w",
    "    end if",
    "  end repeat",
    "end tell",
    'return ""',
  ].join("\n");

  try {
    const windowName = run("osascript", ["-e", raiseScript]).trim();
    return { ok: true, app: terminal.app, window: windowName || null };
  } catch {
    return { ok: true, app: terminal.app, window: null };
  }
}
