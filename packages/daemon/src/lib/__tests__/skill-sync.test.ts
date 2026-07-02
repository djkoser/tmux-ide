/**
 * Tests for the managed skill-sync flow. The pure marker helpers (parse/render/
 * rewrite) are checked against fixtures; {@link syncSkill} is exercised against a
 * scratch source file + a `TMUX_IDE_CLAUDE_DIR` override so it never reads or
 * writes the real `~/.claude`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installedSkillVersion,
  parseSkillVersion,
  rewriteVersionMarker,
  skillTargetDir,
  syncSkill,
  versionMarker,
} from "../skill-sync.ts";

const SKILL = (version: string) =>
  `# tmux-ide — Claude Code Skill\n${versionMarker(version)}\n\nBody text here.\n`;

describe("parseSkillVersion", () => {
  it("reads the marker version", () => {
    expect(parseSkillVersion(SKILL("2.6.0"))).toBe("2.6.0");
  });

  it("is null when no marker is present", () => {
    expect(parseSkillVersion("# no marker\n\njust text")).toBeNull();
  });
});

describe("rewriteVersionMarker", () => {
  it("substitutes the version in place, leaving the rest byte-identical", () => {
    const out = rewriteVersionMarker(SKILL("2.6.0"), "9.9.9");
    expect(out).toBe(SKILL("9.9.9"));
    expect(parseSkillVersion(out)).toBe("9.9.9");
  });

  it("returns content unchanged when there is no marker", () => {
    const noMarker = "# tmux-ide\n\nbody";
    expect(rewriteVersionMarker(noMarker, "1.2.3")).toBe(noMarker);
  });
});

describe("syncSkill", () => {
  let claudeHome: string;
  let source: string;
  const prevEnv = process.env.TMUX_IDE_CLAUDE_DIR;

  beforeEach(() => {
    claudeHome = mkdtempSync(join(tmpdir(), "skillsync-claude-"));
    process.env.TMUX_IDE_CLAUDE_DIR = claudeHome;
    const srcDir = mkdtempSync(join(tmpdir(), "skillsync-src-"));
    source = join(srcDir, "SKILL.md");
    writeFileSync(source, SKILL("0.0.0"), "utf-8");
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.TMUX_IDE_CLAUDE_DIR;
    else process.env.TMUX_IDE_CLAUDE_DIR = prevEnv;
    rmSync(claudeHome, { recursive: true, force: true });
  });

  it("installs into <claudeDir>/skills/tmux-ide with the marker rewritten", () => {
    const result = syncSkill({ source, version: "2.6.0" });
    expect(result.action).toBe("installed");
    expect(result.to).toBe("2.6.0");
    expect(result.path).toBe(join(skillTargetDir(), "SKILL.md"));
    // the copy carries the substituted version, not the source's 0.0.0
    expect(installedSkillVersion()).toBe("2.6.0");
    expect(readFileSync(result.path, "utf-8")).toBe(SKILL("2.6.0"));
  });

  it("is idempotent — a re-run at the same version is unchanged (no rewrite)", () => {
    syncSkill({ source, version: "2.6.0" });
    const again = syncSkill({ source, version: "2.6.0" });
    expect(again.action).toBe("unchanged");
    expect(again.to).toBe("2.6.0");
  });

  it("updates when the installed version differs, reporting from/to", () => {
    syncSkill({ source, version: "2.6.0" });
    const bumped = syncSkill({ source, version: "2.7.0" });
    expect(bumped.action).toBe("updated");
    expect(bumped.from).toBe("2.6.0");
    expect(bumped.to).toBe("2.7.0");
    expect(installedSkillVersion()).toBe("2.7.0");
  });

  it("updates when the source content changes even at the same version", () => {
    syncSkill({ source, version: "2.6.0" });
    writeFileSync(source, SKILL("0.0.0").replace("Body text here.", "New body."), "utf-8");
    const changed = syncSkill({ source, version: "2.6.0" });
    expect(changed.action).toBe("updated");
    expect(readFileSync(changed.path, "utf-8")).toContain("New body.");
  });
});
