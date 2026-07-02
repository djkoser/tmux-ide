import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_KEY,
  SIDEBAR_PANE_OPTION,
  parseSidebarWidth,
  resolveSidebarConfig,
  sidebarSplitCommand,
  sidebarToggleBindCommand,
  sidebarToggleUnbindCommand,
} from "./sidebar.ts";

describe("resolveSidebarConfig", () => {
  it("enables at default width for `true`", () => {
    expect(resolveSidebarConfig(true)).toEqual({ enabled: true, width: DEFAULT_SIDEBAR_WIDTH });
  });

  it("disables for false / undefined", () => {
    expect(resolveSidebarConfig(false)).toEqual({ enabled: false, width: DEFAULT_SIDEBAR_WIDTH });
    expect(resolveSidebarConfig(undefined)).toEqual({
      enabled: false,
      width: DEFAULT_SIDEBAR_WIDTH,
    });
  });

  it("reads an explicit width from the object form", () => {
    expect(resolveSidebarConfig({ width: "40" })).toEqual({ enabled: true, width: 40 });
  });

  it("falls back to the default width for a missing/garbage width", () => {
    expect(resolveSidebarConfig({})).toEqual({ enabled: true, width: DEFAULT_SIDEBAR_WIDTH });
    expect(resolveSidebarConfig({ width: "nope" })).toEqual({
      enabled: true,
      width: DEFAULT_SIDEBAR_WIDTH,
    });
  });
});

describe("parseSidebarWidth", () => {
  it("accepts strings and numbers", () => {
    expect(parseSidebarWidth("32")).toBe(32);
    expect(parseSidebarWidth(28)).toBe(28);
  });

  it("floors narrow widths at 10 and rejects non-positive", () => {
    expect(parseSidebarWidth("4")).toBe(10);
    expect(parseSidebarWidth(0)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(parseSidebarWidth(-5)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});

describe("sidebarToggleBindCommand", () => {
  it("binds the default key to a run-shell that expands the session", () => {
    expect(sidebarToggleBindCommand()).toEqual([
      "bind-key",
      "-n",
      SIDEBAR_KEY,
      "run-shell",
      "tmux-ide sidebar-toggle --session '#{session_name}'",
    ]);
  });

  it("honors a custom cli + key", () => {
    const cmd = sidebarToggleBindCommand("bun run toggle", "M-x");
    expect(cmd[2]).toBe("M-x");
    expect(cmd.at(-1)).toBe("bun run toggle --session '#{session_name}'");
  });
});

describe("sidebarToggleUnbindCommand", () => {
  it("unbinds the configured key", () => {
    expect(sidebarToggleUnbindCommand("M-b")).toEqual(["unbind-key", "-n", "M-b"]);
  });
});

describe("sidebarSplitCommand", () => {
  it("builds a full-height (-f) left (-b) horizontal split at a fixed width", () => {
    const cmd = sidebarSplitCommand("web", "/p/web", 30, "bun sidebar");
    expect(cmd).toEqual([
      "split-window",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      "web",
      "-h",
      "-b",
      "-f",
      "-l",
      "30",
      "-c",
      "/p/web",
      "bun sidebar",
    ]);
  });
});

describe("SIDEBAR_PANE_OPTION", () => {
  it("is the tmux pane option the data layer excludes on", () => {
    expect(SIDEBAR_PANE_OPTION).toBe("@tmux_ide_sidebar");
  });
});
