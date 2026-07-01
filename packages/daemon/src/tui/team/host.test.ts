import { describe, expect, it } from "vitest";
import {
  HOST_SESSION,
  MAIN_PANE,
  SWITCHER_PANE,
  hostLayoutCommands,
  mainRespawnCommand,
  switcherPaneCommand,
} from "./host.ts";

describe("host pane constants", () => {
  it("addresses the switcher as pane 0 and the main area as pane 1", () => {
    expect(SWITCHER_PANE).toBe(`${HOST_SESSION}:0.0`);
    expect(MAIN_PANE).toBe(`${HOST_SESSION}:0.1`);
  });
});

describe("switcherPaneCommand", () => {
  it("cds into the repo root, forwards the invoke dir, and runs the switcher under bun", () => {
    const cmd = switcherPaneCommand("/repo", "/repo/switcher.tsx", "/work");
    expect(cmd).toContain("cd '/repo'");
    expect(cmd).toContain("TMUX_IDE_CWD='/work'");
    expect(cmd).toContain("bun '/repo/switcher.tsx'");
  });

  it("exports the main-pane target so the switcher runs in host mode", () => {
    const cmd = switcherPaneCommand("/repo", "/repo/switcher.tsx", "/work");
    expect(cmd).toContain(`TMUX_IDE_MAIN_PANE='${MAIN_PANE}'`);
  });

  it("shell-escapes paths that contain spaces", () => {
    const cmd = switcherPaneCommand("/my repo", "/my repo/switcher.tsx", "/some dir");
    expect(cmd).toContain("cd '/my repo'");
    expect(cmd).toContain("TMUX_IDE_CWD='/some dir'");
    expect(cmd).toContain("bun '/my repo/switcher.tsx'");
  });
});

describe("mainRespawnCommand", () => {
  const argv = mainRespawnCommand(MAIN_PANE, "my-project", "/work");

  it("respawns the main pane, killing whatever it was running", () => {
    expect(argv[0]).toBe("respawn-pane");
    expect(argv).toContain("-k");
    expect(argv).toContain("-t");
    expect(argv).toContain(MAIN_PANE);
  });

  it("sets the pane working directory", () => {
    expect(argv).toContain("-c");
    expect(argv).toContain("/work");
  });

  it("runs a nested tmux attach with $TMUX cleared", () => {
    expect(argv.at(-1)).toBe("TMUX= tmux attach -t 'my-project'");
  });

  it("orders the argv as respawn-pane -k -t <pane> -c <dir> <command>", () => {
    expect(mainRespawnCommand("_tmux-ide:0.1", "sess", "/dir")).toEqual([
      "respawn-pane",
      "-k",
      "-t",
      "_tmux-ide:0.1",
      "-c",
      "/dir",
      "TMUX= tmux attach -t 'sess'",
    ]);
  });
});

describe("hostLayoutCommands", () => {
  const commands = hostLayoutCommands({
    session: HOST_SESSION,
    repoRoot: "/repo",
    switcherScript: "/repo/switcher.tsx",
    userCwd: "/work",
    switcherWidth: 34,
  });

  it("builds the layout in order: new-session, split-window, resize-pane, select-pane", () => {
    expect(commands.map((argv) => argv[0])).toEqual([
      "new-session",
      "split-window",
      "resize-pane",
      "select-pane",
    ]);
  });

  it("starts a detached session running the switcher command from the repo root", () => {
    const [newSession] = commands;
    expect(newSession).toContain("-d");
    expect(newSession).toContain("-s");
    expect(newSession).toContain(HOST_SESSION);
    expect(newSession).toContain("-c");
    expect(newSession).toContain("/repo");
    // The final argument is the switcher shell command.
    expect(newSession!.at(-1)).toBe(switcherPaneCommand("/repo", "/repo/switcher.tsx", "/work"));
  });

  it("splits a shell to the RIGHT (-h) started in the user's cwd", () => {
    const split = commands[1]!;
    expect(split[0]).toBe("split-window");
    expect(split).toContain("-h");
    expect(split).toContain("-t");
    expect(split).toContain(`${HOST_SESSION}:0.0`);
    expect(split).toContain("-c");
    expect(split).toContain("/work");
  });

  it("pins the switcher pane to the requested width", () => {
    const resize = commands[2]!;
    expect(resize[0]).toBe("resize-pane");
    expect(resize).toContain("-t");
    expect(resize).toContain(`${HOST_SESSION}:0.0`);
    expect(resize).toContain("-x");
    expect(resize).toContain("34");
  });

  it("selects the switcher pane back into focus", () => {
    const select = commands[3]!;
    expect(select[0]).toBe("select-pane");
    expect(select).toContain("-t");
    expect(select).toContain(`${HOST_SESSION}:0.0`);
  });

  it("addresses the switcher as pane 0 in window 0", () => {
    // new-session targets the switcher implicitly; every follow-up targets 0.0.
    for (const argv of commands.slice(1)) {
      expect(argv).toContain(`${HOST_SESSION}:0.0`);
    }
  });
});
