import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeDispatchFile,
  LONG_MESSAGE_THRESHOLD,
  isWildcardTarget,
  resolvePanesByWildcard,
  resolveSendTargets,
} from "./send.ts";
import type { PaneInfo } from "./widgets/lib/pane-comms.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmux-ide-send-test-"));
  mkdirSync(join(tmpDir, ".tasks"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeDispatchFile", () => {
  it("writes long message to dispatch file and returns trigger command", () => {
    const longMessage = "x".repeat(200);
    const result = writeDispatchFile(tmpDir, "%1", longMessage);

    expect(result).not.toBeNull();
    expect(result!.triggerCmd).toContain(".tasks/dispatch/");
    expect(result!.triggerCmd).toContain("send-1-");
    expect(existsSync(result!.filePath)).toBe(true);
    expect(readFileSync(result!.filePath, "utf-8")).toBe(longMessage);
  });

  it("returns null for short messages", () => {
    const result = writeDispatchFile(tmpDir, "%1", "hello");
    expect(result).toBeNull();
  });

  it("returns null for messages exactly at threshold", () => {
    const result = writeDispatchFile(tmpDir, "%1", "x".repeat(LONG_MESSAGE_THRESHOLD));
    expect(result).toBeNull();
  });

  it("creates dispatch directory if it does not exist", () => {
    const longMessage = "y".repeat(200);
    const result = writeDispatchFile(tmpDir, "%2", longMessage);
    expect(result).not.toBeNull();
    expect(existsSync(join(tmpDir, ".tasks", "dispatch"))).toBe(true);
  });

  it("creates unique filenames for different panes", () => {
    const msg = "z".repeat(200);
    const r1 = writeDispatchFile(tmpDir, "%1", msg);
    const r2 = writeDispatchFile(tmpDir, "%2", msg);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.filePath).not.toBe(r2!.filePath);
  });

  it("adds a random suffix so same-pane writes stay unique in the same millisecond", () => {
    const originalNow = Date.now;
    Date.now = () => 1234567890;
    try {
      const msg = "z".repeat(200);
      const r1 = writeDispatchFile(tmpDir, "%1", msg);
      const r2 = writeDispatchFile(tmpDir, "%1", msg);
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.filePath).not.toBe(r2!.filePath);
    } finally {
      Date.now = originalNow;
    }
  });
});

function pane(overrides: Partial<PaneInfo> & Pick<PaneInfo, "id" | "title">): PaneInfo {
  return {
    index: 0,
    currentCommand: "node",
    width: 100,
    height: 40,
    active: false,
    role: null,
    name: null,
    type: null,
    ...overrides,
  };
}

const TEAM_PANES: PaneInfo[] = [
  pane({ id: "%7", title: "team-input" }),
  pane({ id: "%1", title: "lead", role: "lead", name: "lead", type: "agent" }),
  pane({ id: "%3", title: "validator", role: "validator", name: "validator", type: "agent" }),
  pane({ id: "%2", title: "cw1", role: "teammate", name: "cw1", type: "agent" }),
  pane({ id: "%4", title: "cw2", role: "teammate", name: "cw2", type: "agent" }),
  pane({ id: "%5", title: "⠐ cw3", role: "teammate", name: "cw3", type: "agent" }),
  pane({ id: "%6", title: "cw4", role: "teammate", name: "cw4", type: "agent" }),
];

describe("isWildcardTarget", () => {
  it("detects * and ? globs", () => {
    expect(isWildcardTarget("cw*")).toBe(true);
    expect(isWildcardTarget("*")).toBe(true);
    expect(isWildcardTarget("cw?")).toBe(true);
  });

  it("treats plain names as exact targets", () => {
    expect(isWildcardTarget("cw1")).toBe(false);
    expect(isWildcardTarget("lead")).toBe(false);
    expect(isWildcardTarget("%1")).toBe(false);
  });
});

describe("resolvePanesByWildcard", () => {
  it("fans out cw* to every cw pane, matching @ide_name when the title is decorated", () => {
    const matched = resolvePanesByWildcard(TEAM_PANES, "cw*");
    expect(matched.map((p) => p.name)).toEqual(["cw1", "cw2", "cw3", "cw4"]);
  });

  it("broadcasts * to all agent panes, excluding the team-input pane", () => {
    const matched = resolvePanesByWildcard(TEAM_PANES, "*");
    expect(matched.map((p) => p.name)).toEqual(["lead", "validator", "cw1", "cw2", "cw3", "cw4"]);
    expect(matched.some((p) => p.title === "team-input")).toBe(false);
  });

  it("matches agent panes by role when @ide_type is unset", () => {
    const legacy = [pane({ id: "%9", title: "cw9", role: "teammate", name: "cw9" })];
    expect(resolvePanesByWildcard(legacy, "cw*").map((p) => p.name)).toEqual(["cw9"]);
  });

  it("supports ? single-character globs", () => {
    expect(resolvePanesByWildcard(TEAM_PANES, "cw?").map((p) => p.name)).toEqual([
      "cw1",
      "cw2",
      "cw3",
      "cw4",
    ]);
  });

  it("returns empty for a glob matching nothing", () => {
    expect(resolvePanesByWildcard(TEAM_PANES, "zz*")).toEqual([]);
  });

  it("does not treat glob metacharacters as regex", () => {
    expect(resolvePanesByWildcard(TEAM_PANES, "c.*")).toEqual([]);
  });
});

describe("resolveSendTargets", () => {
  it("keeps exact-name resolution single-target", () => {
    const targets = resolveSendTargets(TEAM_PANES, "cw3");
    expect(targets.map((p) => p.id)).toEqual(["%5"]);
  });

  it("still resolves the team-input pane by exact title", () => {
    expect(resolveSendTargets(TEAM_PANES, "team-input").map((p) => p.id)).toEqual(["%7"]);
  });

  it("resolves pane IDs unchanged", () => {
    expect(resolveSendTargets(TEAM_PANES, "%4").map((p) => p.name)).toEqual(["cw2"]);
  });

  it("fans out globs to multiple targets", () => {
    expect(resolveSendTargets(TEAM_PANES, "cw*")).toHaveLength(4);
  });

  it("returns empty for unknown exact names and unmatched globs", () => {
    expect(resolveSendTargets(TEAM_PANES, "nope")).toEqual([]);
    expect(resolveSendTargets(TEAM_PANES, "nope*")).toEqual([]);
  });
});
