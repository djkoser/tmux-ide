import { describe, it, expect } from "bun:test";
import { focusSessionWindow, type FocusRunner } from "./focus.ts";

interface Call {
  cmd: string;
  args: string[];
}

/** Runner scripted per command; records every call so tests can assert order. */
function scriptedRunner(handlers: {
  clients?: string | Error;
  termProgram?: string | Error;
  activate?: string | Error;
  raise?: string | Error;
}): { run: FocusRunner; calls: Call[] } {
  const calls: Call[] = [];
  const run: FocusRunner = (cmd, args) => {
    calls.push({ cmd, args });
    const result =
      cmd === "tmux" && args[0] === "list-clients"
        ? (handlers.clients ?? "/dev/ttys001\n")
        : cmd === "tmux" && args[0] === "show-environment"
          ? (handlers.termProgram ?? "TERM_PROGRAM=iTerm.app\n")
          : cmd === "osascript" && args[1]!.includes("to activate")
            ? (handlers.activate ?? "")
            : (handlers.raise ?? "");
    if (result instanceof Error) throw result;
    return result;
  };
  return { run, calls };
}

describe("focusSessionWindow", () => {
  it("activates the terminal and raises the matching window", () => {
    const { run, calls } = scriptedRunner({ raise: "1: my-team — tmux\n" });
    const result = focusSessionWindow("my-team", run);

    expect(result).toEqual({ ok: true, app: "iTerm", window: "1: my-team — tmux" });
    expect(calls.map((c) => c.cmd)).toEqual(["tmux", "tmux", "osascript", "osascript"]);
    expect(calls[2]!.args[1]).toContain('tell application "iTerm" to activate');
    expect(calls[3]!.args[1]).toContain('name of w contains "my-team"');
  });

  it("falls back to app activation when window raising fails", () => {
    const { run } = scriptedRunner({ raise: new Error("no accessibility permission") });
    const result = focusSessionWindow("my-team", run);
    expect(result.ok).toBe(true);
    expect(result.window).toBeNull();
  });

  it("reports success with a null window when no title matches", () => {
    const { run } = scriptedRunner({ raise: "\n" });
    expect(focusSessionWindow("my-team", run).window).toBeNull();
  });

  it("maps Apple_Terminal to the Terminal app", () => {
    const { run, calls } = scriptedRunner({ termProgram: "TERM_PROGRAM=Apple_Terminal\n" });
    const result = focusSessionWindow("my-team", run);
    expect(result.app).toBe("Terminal");
    expect(calls[2]!.args[1]).toContain('"Terminal"');
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

  it("strips quote characters from the session name in the raise script", () => {
    const { run, calls } = scriptedRunner({});
    focusSessionWindow('evil" -- inject', run);
    const raiseScript = calls[3]!.args[1]!;
    expect(raiseScript).not.toContain('evil"');
    expect(raiseScript).toContain("evil -- inject");
  });
});
