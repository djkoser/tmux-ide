import { describe, it, expect } from "bun:test";
import { focusSessionWindow, matchWindowIndex, type FocusRunner } from "./focus.ts";

interface Call {
  cmd: string;
  args: string[];
}

/** Runner scripted per command; records every call so tests can assert order. */
function scriptedRunner(handlers: {
  clients?: string | Error;
  termProgram?: string | Error;
  /** Global-scope (-g) show-environment answer; defaults to termProgram's. */
  globalTermProgram?: string | Error;
  activate?: string | Error;
  /** Window-title listing (linefeed-joined). */
  list?: string | Error;
  raise?: string | Error;
}): { run: FocusRunner; calls: Call[] } {
  const calls: Call[] = [];
  const run: FocusRunner = (cmd, args) => {
    calls.push({ cmd, args });
    const result =
      cmd === "tmux" && args[0] === "list-clients"
        ? (handlers.clients ?? "/dev/ttys001\n")
        : cmd === "tmux" && args[0] === "show-environment" && args[1] === "-g"
          ? (handlers.globalTermProgram ?? handlers.termProgram ?? "TERM_PROGRAM=iTerm.app\n")
          : cmd === "tmux" && args[0] === "show-environment"
            ? (handlers.termProgram ?? "TERM_PROGRAM=iTerm.app\n")
            : cmd === "osascript" && args[1]!.includes("to activate")
              ? (handlers.activate ?? "")
              : cmd === "osascript" && args[1]!.includes("name of every window")
                ? (handlers.list ?? "1: my-team — tmux\n")
                : (handlers.raise ?? "");
    if (result instanceof Error) throw result;
    return result;
  };
  return { run, calls };
}

describe("matchWindowIndex", () => {
  it("matches a title carrying the session name", () => {
    expect(matchWindowIndex(["other", "1: my-team — tmux"], "my-team")).toBe(1);
  });

  it("rejects titles where the session is a prefix of a longer name", () => {
    const names = ["team_3 — tmux ◂ bun — 186×56", "team — tmux ◂ bun — 186×56"];
    expect(matchWindowIndex(names, "team")).toBe(1);
    expect(matchWindowIndex(names, "team_3")).toBe(0);
  });

  it("falls back to a plain substring match when no boundary match exists", () => {
    expect(matchWindowIndex(["tmux:my-teamX"], "my-team")).toBe(0);
  });

  it("returns -1 when nothing matches", () => {
    expect(matchWindowIndex(["alpha", "beta"], "my-team")).toBe(-1);
  });

  it("escapes regex metacharacters in the session name", () => {
    expect(matchWindowIndex(["a+b — tmux"], "a+b")).toBe(0);
    expect(matchWindowIndex(["axb — tmux"], "a+b")).toBe(-1);
  });
});

describe("focusSessionWindow", () => {
  it("activates the terminal and raises the matching window by index", () => {
    const { run, calls } = scriptedRunner({
      list: "scratch\n1: my-team — tmux\n",
    });
    const result = focusSessionWindow("my-team", run);

    expect(result).toEqual({ ok: true, app: "iTerm", window: "1: my-team — tmux" });
    expect(calls.map((c) => c.cmd)).toEqual(["tmux", "tmux", "osascript", "osascript", "osascript"]);
    expect(calls[2]!.args[1]).toContain('tell application "iTerm" to activate');
    expect(calls[4]!.args[1]).toContain('perform action "AXRaise" of window 2');
  });

  it("raises the exact session's window when another session name extends it", () => {
    const { run, calls } = scriptedRunner({
      list: "team_3 — tmux ◂ bun — 186×56\nteam — tmux ◂ bun — 186×56\n",
    });
    const result = focusSessionWindow("team", run);

    expect(result.window).toBe("team — tmux ◂ bun — 186×56");
    expect(calls[4]!.args[1]).toContain('perform action "AXRaise" of window 2');
  });

  it("falls back to app activation when window listing fails", () => {
    const { run } = scriptedRunner({ list: new Error("no accessibility permission") });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(true);
    expect(result.window).toBeNull();
  });

  it("falls back to app activation when raising fails", () => {
    const { run } = scriptedRunner({ raise: new Error("no accessibility permission") });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(true);
    expect(result.window).toBeNull();
  });

  it("reports success with a null window when no title matches", () => {
    const { run, calls } = scriptedRunner({ list: "unrelated window\n" });
    const result = focusSessionWindow("my-team", run);
    expect(result.window).toBeNull();
    // No raise call after a failed match
    expect(calls.filter((c) => c.cmd === "osascript")).toHaveLength(2);
  });

  it("maps Apple_Terminal to the Terminal app", () => {
    const { run, calls } = scriptedRunner({ termProgram: "TERM_PROGRAM=Apple_Terminal\n" });
    const result = focusSessionWindow("my-team", run);
    expect(result.app).toBe("Terminal");
    expect(calls[2]!.args[1]).toContain('"Terminal"');
  });

  it("falls back to the global environment when the session scope lacks TERM_PROGRAM", () => {
    // Default tmux configs never propagate TERM_PROGRAM into the session
    // scope (not in update-environment), so this is the common real-world path.
    const { run, calls } = scriptedRunner({
      termProgram: new Error("unknown variable: TERM_PROGRAM"),
      globalTermProgram: "TERM_PROGRAM=Apple_Terminal\n",
    });
    const result = focusSessionWindow("my-team", run);

    expect(result.ok).toBe(true);
    expect(result.app).toBe("Terminal");
    const envCalls = calls.filter((c) => c.args[0] === "show-environment");
    expect(envCalls.map((c) => c.args[1])).toEqual(["-t", "-g"]);
  });

  it("skips the global lookup when the session scope has TERM_PROGRAM", () => {
    const { run, calls } = scriptedRunner({ termProgram: "TERM_PROGRAM=iTerm.app\n" });
    focusSessionWindow("my-team", run);
    const envCalls = calls.filter((c) => c.args[0] === "show-environment");
    expect(envCalls.map((c) => c.args[1])).toEqual(["-t"]);
  });

  it("fails when both session and global scopes lack TERM_PROGRAM", () => {
    const { run, calls } = scriptedRunner({
      termProgram: new Error("unset"),
      globalTermProgram: new Error("unset"),
    });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("TERM_PROGRAM=unset");
    expect(calls.some((c) => c.cmd === "osascript")).toBe(false);
  });

  it("fails without osascript for an unrecognized TERM_PROGRAM", () => {
    const { run, calls } = scriptedRunner({ termProgram: "TERM_PROGRAM=mystery\n" });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("mystery");
    expect(calls.some((c) => c.cmd === "osascript")).toBe(false);
  });

  it("distinguishes no-attached-client from unrecognized terminal", () => {
    const { run } = scriptedRunner({ clients: "\n", termProgram: new Error("unset") });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no attached client");
  });

  it("fails when the tmux session is unreachable", () => {
    const { run } = scriptedRunner({ clients: new Error("no server") });
    const result = focusSessionWindow("ghost", run);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not reachable");
  });

  it("reports failure when activation itself errors", () => {
    const { run } = scriptedRunner({ activate: new Error("app not installed") });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("could not activate");
  });

  it("never embeds the raw session name in any osascript source", () => {
    const { run, calls } = scriptedRunner({ list: "no match here\n" });
    focusSessionWindow('evil" -- inject', run);
    for (const call of calls.filter((c) => c.cmd === "osascript")) {
      expect(call.args[1]).not.toContain('evil"');
    }
  });
});
