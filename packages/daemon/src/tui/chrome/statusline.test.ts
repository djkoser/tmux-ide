/**
 * Unit tests for the pure status-bar builder.
 */
import { describe, expect, it } from "vitest";
import { buildStatusline, popupBindCommand, popupUnbindCommand, POPUP_KEY } from "./statusline.ts";
import type { TeamProject } from "../team/projects.ts";
import type { TeamSession } from "../team/sessions.ts";

function session(name: string, status: TeamSession["status"]): TeamSession {
  return { name, attached: false, windows: 1, panes: 1, status };
}

function project(name: string, overrides: Partial<TeamProject> = {}): TeamProject {
  return {
    name,
    dir: `/p/${name}`,
    hasIdeYml: false,
    gitBranch: null,
    registered: true,
    running: true,
    status: "idle",
    sessions: [session(name, "idle")],
    ...overrides,
  };
}

describe("buildStatusline", () => {
  it("renders a running project with its status glyph and name", () => {
    const bar = buildStatusline([project("web", { status: "working" })], null);
    expect(bar).toContain("tmux-ide");
    expect(bar).toContain("#[fg=colour221]●#[default]");
    expect(bar).toContain("web");
  });

  it("renders a stopped project muted with a hollow glyph", () => {
    const bar = buildStatusline([project("api", { running: false, sessions: [] })], null);
    expect(bar).toContain("#[fg=colour240]○#[default]");
    expect(bar).toContain("#[fg=colour240]api#[default]");
  });

  it("highlights the active session's project", () => {
    const bar = buildStatusline([project("web"), project("api")], "web");
    expect(bar).toContain("#[fg=colour231,bold,underscore]web#[default]");
    expect(bar).not.toContain("underscore]api");
  });

  it("matches active by contained session name, not just project name", () => {
    const p = project("mono", { sessions: [session("mono-api", "idle")] });
    const bar = buildStatusline([p], "mono-api");
    expect(bar).toContain("underscore]mono#[default]");
  });

  it("uses the blocked style for a blocked project", () => {
    const bar = buildStatusline([project("hot", { status: "blocked" })], null);
    expect(bar).toContain("#[fg=colour203,bold]●#[default]");
  });

  it("caps segments and reports the overflow count", () => {
    const many = Array.from({ length: 15 }, (_, i) => project(`p${i}`));
    const bar = buildStatusline(many, null, 12);
    expect(bar).toContain("p11");
    expect(bar).not.toContain("p12 ");
    expect(bar).toContain("+3");
  });

  it("renders the brand alone for an empty fleet", () => {
    const bar = buildStatusline([], null);
    expect(bar).toContain("tmux-ide");
  });
});

describe("popupBindCommand", () => {
  it("binds M-p in the root table to a display-popup running the switcher", () => {
    const cmd = popupBindCommand();
    expect(cmd.slice(0, 5)).toEqual(["bind-key", "-n", POPUP_KEY, "display-popup", "-E"]);
    // sized popup, switcher command last
    expect(cmd).toContain("-w");
    expect(cmd).toContain("-h");
    expect(cmd[cmd.length - 1]).toBe("tmux-ide switcher");
  });

  it("uses M-p as the popup key (root table, avoids prefix p)", () => {
    expect(POPUP_KEY).toBe("M-p");
  });

  it("passes a custom switcher command through as the bound command", () => {
    const cmd = popupBindCommand("bun run switcher");
    expect(cmd[cmd.length - 1]).toBe("bun run switcher");
  });

  it("does NOT append a #{client_name} arg (it would not format-expand)", () => {
    // The switcher resolves its own client from inside the popup instead.
    expect(popupBindCommand().join(" ")).not.toContain("client_name");
  });
});

describe("popupUnbindCommand", () => {
  it("unbinds M-p from the root table", () => {
    expect(popupUnbindCommand()).toEqual(["unbind-key", "-n", POPUP_KEY]);
  });
});
