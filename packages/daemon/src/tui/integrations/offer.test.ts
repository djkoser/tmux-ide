/**
 * Unit tests for the one-time integration offer: the PURE gating decision, the
 * marker/env plumbing, and the prompt text. All io is scoped to a per-test temp
 * dir via `TMUX_IDE_HOME` so the real `~/.tmux-ide/integration-offered` marker
 * is never read or written.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildOfferText,
  integrationOfferMarkerPath,
  markIntegrationOffered,
  shouldOfferIntegration,
} from "./offer.ts";

const savedHome = process.env.TMUX_IDE_HOME;
let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "zz-offer-"));
  process.env.TMUX_IDE_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env.TMUX_IDE_HOME;
  else process.env.TMUX_IDE_HOME = savedHome;
});

describe("integrationOfferMarkerPath", () => {
  it("honours TMUX_IDE_HOME, pointing at <home>/integration-offered", () => {
    expect(integrationOfferMarkerPath()).toBe(join(home, "integration-offered"));
  });
});

describe("shouldOfferIntegration", () => {
  const base = {
    claudeOnPath: true,
    integrationInstalled: false,
    markerPresent: false,
    offerEnabled: true,
  };

  it("offers when claude is present, not installed, no marker, config on", () => {
    expect(shouldOfferIntegration(base)).toBe(true);
  });

  it("does NOT offer when claude is missing from PATH", () => {
    expect(shouldOfferIntegration({ ...base, claudeOnPath: false })).toBe(false);
  });

  it("does NOT offer when the integration is already installed", () => {
    expect(shouldOfferIntegration({ ...base, integrationInstalled: true })).toBe(false);
  });

  it("does NOT offer when the marker is already present", () => {
    expect(shouldOfferIntegration({ ...base, markerPresent: true })).toBe(false);
  });

  it("does NOT offer when config has disabled the offer", () => {
    expect(shouldOfferIntegration({ ...base, offerEnabled: false })).toBe(false);
  });
});

describe("markIntegrationOffered", () => {
  it("creates the marker (and its home dir) so the offer shows only once", () => {
    process.env.TMUX_IDE_HOME = join(home, "nested", "dir");
    expect(existsSync(integrationOfferMarkerPath())).toBe(false);
    markIntegrationOffered();
    expect(existsSync(integrationOfferMarkerPath())).toBe(true);
    expect(readFileSync(integrationOfferMarkerPath(), "utf-8").length).toBeGreaterThan(0);
  });
});

describe("buildOfferText", () => {
  it("asks the install question and names the y/skip keys", () => {
    const text = buildOfferText();
    expect(text).toContain("Claude Code detected");
    expect(text.toLowerCase()).toContain("install");
    expect(text).toContain("[y]");
    expect(text).toContain("[N]");
  });
});
