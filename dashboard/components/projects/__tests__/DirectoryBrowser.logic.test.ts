import { describe, expect, it } from "vitest";
import {
  browserReducer,
  findEntryIndex,
  initialBrowserState,
  parsePath,
  selectIndex,
  truncateMiddlePath,
} from "../DirectoryBrowser.logic";
import type { FilesystemBrowseResult, FilesystemEntry } from "@/lib/api";

function entry(name: string, isDir: boolean, fullPath = `/parent/${name}`): FilesystemEntry {
  return { name, fullPath, isDir, isSymlink: false };
}

describe("parsePath", () => {
  it("trims whitespace", () => {
    expect(parsePath("  /Users/me  ")).toBe("/Users/me");
  });
  it("returns empty for whitespace-only input", () => {
    expect(parsePath("   ")).toBe("");
  });
});

describe("truncateMiddlePath", () => {
  it("returns path unchanged when shorter than limit", () => {
    expect(truncateMiddlePath("/short/path", 60)).toBe("/short/path");
  });
  it("collapses middle of long absolute paths", () => {
    const long = "/Users/thijs/Developer/some-very-long-project-name/with/many/parts";
    const truncated = truncateMiddlePath(long, 30);
    expect(truncated.length).toBeLessThanOrEqual(31);
    expect(truncated).toContain("…");
    expect(truncated).toContain("parts");
  });
});

describe("selectIndex", () => {
  it("moves down within bounds", () => {
    expect(selectIndex(2, "ArrowDown", 5)).toBe(3);
  });
  it("wraps at the bottom", () => {
    expect(selectIndex(4, "ArrowDown", 5)).toBe(0);
  });
  it("wraps at the top", () => {
    expect(selectIndex(0, "ArrowUp", 5)).toBe(4);
  });
  it("returns 0 for empty list", () => {
    expect(selectIndex(0, "ArrowUp", 0)).toBe(0);
  });
});

describe("findEntryIndex", () => {
  const entries = [entry("a", true), entry("b", true), entry("c.md", false)];
  it("finds an existing entry", () => {
    expect(findEntryIndex(entries, "b")).toBe(1);
  });
  it("returns -1 when missing", () => {
    expect(findEntryIndex(entries, "z")).toBe(-1);
  });
  it("returns -1 when name is null", () => {
    expect(findEntryIndex(entries, null)).toBe(-1);
  });
});

describe("browserReducer", () => {
  const start = initialBrowserState("/Users/me", false);

  it("transitions through requested → loaded", () => {
    const requested = browserReducer(start, {
      type: "requested",
      path: "/Users/me/projects",
      requestId: 1,
    });
    expect(requested.loading).toBe(true);
    expect(requested.error).toBeNull();
    expect(requested.requestId).toBe(1);

    const result: FilesystemBrowseResult = {
      path: "/Users/me/projects",
      parentPath: "/Users/me",
      entries: [entry("alpha", true), entry("README.md", false)],
    };
    const loaded = browserReducer(requested, { type: "loaded", requestId: 1, result });
    expect(loaded.loading).toBe(false);
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.parentPath).toBe("/Users/me");
    expect(loaded.path).toBe("/Users/me/projects");
    expect(loaded.selectedIndex).toBe(0);
  });

  it("ignores stale loaded responses", () => {
    const requested = browserReducer(start, {
      type: "requested",
      path: "/a",
      requestId: 1,
    });
    const requested2 = browserReducer(requested, {
      type: "requested",
      path: "/b",
      requestId: 2,
    });
    const stale: FilesystemBrowseResult = {
      path: "/a",
      parentPath: null,
      entries: [entry("ghost", true)],
    };
    const after = browserReducer(requested2, {
      type: "loaded",
      requestId: 1,
      result: stale,
    });
    // Stale: state should still be loading and pointed at /b.
    expect(after.loading).toBe(true);
    expect(after.path).toBe("/b");
    expect(after.entries).toHaveLength(0);
  });

  it("transitions through requested → failed", () => {
    const requested = browserReducer(start, {
      type: "requested",
      path: "/etc",
      requestId: 1,
    });
    const failed = browserReducer(requested, {
      type: "failed",
      requestId: 1,
      message: "outside-sandbox",
    });
    expect(failed.loading).toBe(false);
    expect(failed.error).toBe("outside-sandbox");
    expect(failed.entries).toHaveLength(0);
  });

  it("clamps selectIndex to valid range", () => {
    const result: FilesystemBrowseResult = {
      path: "/a",
      parentPath: null,
      entries: [entry("a", true), entry("b", true), entry("c", true)],
    };
    const requested = browserReducer(start, { type: "requested", path: "/a", requestId: 1 });
    const loaded = browserReducer(requested, { type: "loaded", requestId: 1, result });
    expect(browserReducer(loaded, { type: "selectIndex", index: -5 }).selectedIndex).toBe(0);
    expect(browserReducer(loaded, { type: "selectIndex", index: 99 }).selectedIndex).toBe(2);
    expect(browserReducer(loaded, { type: "selectIndex", index: 1 }).selectedIndex).toBe(1);
  });

  it("toggles hidden", () => {
    const flipped = browserReducer(start, { type: "toggleHidden" });
    expect(flipped.showHidden).toBe(true);
    const back = browserReducer(flipped, { type: "toggleHidden" });
    expect(back.showHidden).toBe(false);
  });
});
