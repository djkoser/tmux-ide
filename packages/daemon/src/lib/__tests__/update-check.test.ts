/**
 * Unit tests for the update-check module — the pure semver/throttle/parse
 * helpers, plus the cache round-trip and the toast-once persistence (both driven
 * through a `TMUX_IDE_HOME` scratch dir so they never touch the real user cache).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHECK_INTERVAL_MS,
  compareSemver,
  deriveStatus,
  getUpdateStatus,
  isNewer,
  markUpdateNotified,
  parseRegistryResponse,
  readUpdateCache,
  shouldCheck,
  updateCachePath,
  writeUpdateCache,
} from "../update-check.ts";

describe("compareSemver", () => {
  it("orders the numeric core field-by-field (not lexically)", () => {
    // The load-bearing case: 2.10.0 is NEWER than 2.6.0 (10 > 6), which a string
    // compare would get backwards.
    expect(compareSemver("2.10.0", "2.6.0")).toBe(1);
    expect(compareSemver("2.6.0", "2.10.0")).toBe(-1);
    expect(compareSemver("2.6.0", "2.6.0")).toBe(0);
    expect(compareSemver("3.0.0", "2.99.99")).toBe(1);
    expect(compareSemver("1.2.3", "1.2.4")).toBe(-1);
  });

  it("tolerates a leading v and build metadata", () => {
    expect(compareSemver("v2.7.0", "2.6.0")).toBe(1);
    expect(compareSemver("2.6.0+build.5", "2.6.0")).toBe(0);
  });

  it("ranks a release above a prerelease of the same core", () => {
    expect(compareSemver("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareSemver("1.0.0-rc.1", "1.0.0-rc.1")).toBe(0);
  });

  it("coerces garbage/missing parts to 0", () => {
    expect(compareSemver("2", "2.0.0")).toBe(0);
    expect(compareSemver("garbage", "0.0.0")).toBe(0);
    expect(compareSemver("2.x.0", "2.0.0")).toBe(0);
  });
});

describe("isNewer", () => {
  it("is true only when latest strictly exceeds current", () => {
    expect(isNewer("2.10.0", "2.6.0")).toBe(true);
    expect(isNewer("2.6.0", "2.6.0")).toBe(false);
    expect(isNewer("2.5.0", "2.6.0")).toBe(false);
  });
});

describe("shouldCheck", () => {
  const now = 1_000_000_000_000;
  it("checks when never checked before", () => {
    expect(shouldCheck(null, now)).toBe(true);
  });
  it("skips inside the 24h window", () => {
    expect(shouldCheck(now - 1000, now)).toBe(false);
    expect(shouldCheck(now - (CHECK_INTERVAL_MS - 1), now)).toBe(false);
  });
  it("checks once the window has elapsed", () => {
    expect(shouldCheck(now - CHECK_INTERVAL_MS, now)).toBe(true);
    expect(shouldCheck(now - CHECK_INTERVAL_MS * 2, now)).toBe(true);
  });
  it("treats a future timestamp (clock skew) as recent → skip", () => {
    expect(shouldCheck(now + 5000, now)).toBe(false);
  });
});

describe("parseRegistryResponse", () => {
  it("extracts a valid version", () => {
    expect(parseRegistryResponse('{"version":"2.7.1","name":"tmux-ide"}')).toBe("2.7.1");
  });
  it("returns null for malformed JSON", () => {
    expect(parseRegistryResponse("{not json")).toBeNull();
    expect(parseRegistryResponse("")).toBeNull();
  });
  it("returns null when version is missing / wrong type / empty", () => {
    expect(parseRegistryResponse("{}")).toBeNull();
    expect(parseRegistryResponse('{"version":42}')).toBeNull();
    expect(parseRegistryResponse('{"version":""}')).toBeNull();
    expect(parseRegistryResponse("[1,2,3]")).toBeNull();
    expect(parseRegistryResponse("null")).toBeNull();
  });
});

describe("deriveStatus", () => {
  it("reports an update only when the cached latest is newer", () => {
    expect(deriveStatus("2.10.0", "2.6.0")).toEqual({ latest: "2.10.0", updateAvailable: true });
    expect(deriveStatus("2.6.0", "2.6.0")).toEqual({ latest: "2.6.0", updateAvailable: false });
    expect(deriveStatus(null, "2.6.0")).toEqual({ latest: null, updateAvailable: false });
  });
});

describe("cache round-trip + toast-once (TMUX_IDE_HOME scratch)", () => {
  let home: string;
  const prev = process.env.TMUX_IDE_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tmux-ide-uh-"));
    process.env.TMUX_IDE_HOME = home;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.TMUX_IDE_HOME;
    else process.env.TMUX_IDE_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  });

  it("points the cache path at the scratch home", () => {
    expect(updateCachePath()).toBe(join(home, "update-check.json"));
  });

  it("reads null when the cache is absent", () => {
    expect(readUpdateCache()).toBeNull();
  });

  it("round-trips a written cache", () => {
    writeUpdateCache({ lastCheckedAt: 123, latest: "9.9.9", notified: ["9.9.9"] });
    expect(readUpdateCache()).toEqual({ lastCheckedAt: 123, latest: "9.9.9", notified: ["9.9.9"] });
  });

  it("tolerates a malformed cache file (→ null)", () => {
    writeFileSync(join(home, "update-check.json"), "{garbage");
    expect(readUpdateCache()).toBeNull();
  });

  it("getUpdateStatus derives availability from the cache without the network", () => {
    writeUpdateCache({ lastCheckedAt: 1, latest: "9.9.9" });
    expect(getUpdateStatus({ currentVersion: "2.6.0" })).toEqual({
      latest: "9.9.9",
      updateAvailable: true,
    });
    expect(getUpdateStatus({ currentVersion: "9.9.9" })).toEqual({
      latest: "9.9.9",
      updateAvailable: false,
    });
  });

  it("markUpdateNotified fires once per version, persisting across reads", () => {
    writeUpdateCache({ lastCheckedAt: 1, latest: "9.9.9" });
    // First time for 9.9.9 → true, and it's now recorded on disk.
    expect(markUpdateNotified("9.9.9")).toBe(true);
    expect(readUpdateCache()?.notified).toEqual(["9.9.9"]);
    // Second call (simulating an updater restart re-reading the file) → false.
    expect(markUpdateNotified("9.9.9")).toBe(false);
    // A different version is still first-time.
    expect(markUpdateNotified("9.9.10")).toBe(true);
    expect(readUpdateCache()?.notified).toEqual(["9.9.9", "9.9.10"]);
  });

  it("markUpdateNotified works even with no pre-existing cache", () => {
    expect(existsSync(updateCachePath())).toBe(false);
    expect(markUpdateNotified("1.2.3")).toBe(true);
    expect(readUpdateCache()?.notified).toEqual(["1.2.3"]);
  });
});
