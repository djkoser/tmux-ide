/**
 * Unit tests for the first-run welcome card — the marker/env gating and the
 * pure card text. All io is scoped to a per-test temp dir via `TMUX_IDE_HOME`
 * so the real `~/.tmux-ide/welcomed` is never read or written.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWelcomeText, markWelcomed, shouldShowWelcome, welcomeMarkerPath } from "./welcome.ts";
import { DEFAULT_KEYS, _resetForTests } from "../../lib/app-config.ts";

const savedHome = process.env.TMUX_IDE_HOME;
const savedConfig = process.env.TMUX_IDE_CONFIG;
let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "zz-welcome-"));
  process.env.TMUX_IDE_HOME = home;
  // Pin the app config to defaults (welcome.show = true) by pointing at a
  // missing file, so the marker is the only variable under test.
  process.env.TMUX_IDE_CONFIG = join(home, "no-such-config.json");
  _resetForTests();
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.TMUX_IDE_HOME;
  else process.env.TMUX_IDE_HOME = savedHome;
  if (savedConfig === undefined) delete process.env.TMUX_IDE_CONFIG;
  else process.env.TMUX_IDE_CONFIG = savedConfig;
  _resetForTests();
});

describe("welcomeMarkerPath", () => {
  it("honours TMUX_IDE_HOME, pointing at <home>/welcomed", () => {
    expect(welcomeMarkerPath()).toBe(join(home, "welcomed"));
  });
});

describe("shouldShowWelcome / markWelcomed", () => {
  it("shows when the marker is absent and the config allows it", () => {
    expect(existsSync(welcomeMarkerPath())).toBe(false);
    expect(shouldShowWelcome()).toBe(true);
  });

  it("stops showing once marked (marker file created)", () => {
    markWelcomed();
    expect(existsSync(welcomeMarkerPath())).toBe(true);
    expect(shouldShowWelcome()).toBe(false);
  });

  it("creates the home dir if missing when marking", () => {
    // welcomeMarkerPath's dir is the freshly-made temp home; write into a nested
    // override to prove mkdir -p behaviour.
    process.env.TMUX_IDE_HOME = join(home, "nested", "dir");
    markWelcomed();
    expect(existsSync(join(home, "nested", "dir", "welcomed"))).toBe(true);
  });

  it("is suppressed by config welcome.show = false even without a marker", () => {
    writeFileSync(process.env.TMUX_IDE_CONFIG!, JSON.stringify({ welcome: { show: false } }));
    _resetForTests();
    expect(existsSync(welcomeMarkerPath())).toBe(false);
    expect(shouldShowWelcome()).toBe(false);
  });

  it("writes a non-empty timestamp into the marker", () => {
    markWelcomed();
    expect(readFileSync(welcomeMarkerPath(), "utf-8").length).toBeGreaterThan(0);
  });
});

describe("buildWelcomeText", () => {
  it("names the four unlock keys, sourced from the key config", () => {
    const text = buildWelcomeText(DEFAULT_KEYS);
    // the four ways in: right-click menu, home, switch, cheat sheet
    expect(text).toContain("right-click");
    expect(text).toContain("⌥h"); // home (M-h)
    expect(text).toContain("⌥p"); // switch (M-p)
    expect(text).toContain("⌥k"); // cheat sheet (M-k)
    // and it tells the user it only shows once
    expect(text.toLowerCase()).toContain("once");
    expect(text).toContain("tmux-ide");
  });

  it("relabels the keys when they are rebound", () => {
    const text = buildWelcomeText({
      ...DEFAULT_KEYS,
      home: "M-i",
      popup: "M-o",
      cheatsheet: "M-j",
    });
    expect(text).toContain("⌥i");
    expect(text).toContain("⌥o");
    expect(text).toContain("⌥j");
    expect(text).not.toContain("⌥h");
  });

  it("defaults to DEFAULT_KEYS when called with no args", () => {
    expect(buildWelcomeText()).toContain("⌥h");
  });
});
