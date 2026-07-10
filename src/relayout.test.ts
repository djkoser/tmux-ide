import { describe, it, expect, afterEach } from "bun:test";
import { computeRelayout } from "./relayout.ts";
import { _setExecutor, getWindowSize, resizePane } from "./widgets/lib/pane-comms.ts";
import type { IdeConfig } from "./types.ts";

const cfg = {
  rows: [
    { size: "20%", panes: [{ title: "top" }] },
    { panes: [{ title: "a", size: "60%" }, { title: "b" }] },
  ],
} as unknown as IdeConfig;

describe("computeRelayout", () => {
  it("sets every row but the last, addressing rows by their first pane title", () => {
    const ins = computeRelayout(cfg, 200, 100);
    const rowIns = ins.filter((i) => i.axis === "y");
    // usableH = 100 - 1 = 99; row0 = round(99 * 20/100) = 20; last row absorbs remainder
    expect(rowIns).toEqual([{ title: "top", axis: "y", size: 20 }]);
  });

  it("sets every pane but the last within a multi-pane row", () => {
    const ins = computeRelayout(cfg, 200, 100);
    const colIns = ins.filter((i) => i.axis === "x");
    // usableW = 200 - 1 = 199; pane a = round(199 * 60/100) = 119; last pane absorbs remainder
    expect(colIns).toEqual([{ title: "a", axis: "x", size: 119 }]);
  });

  it("returns nothing for a single row of a single pane (nothing to pin)", () => {
    const single = { rows: [{ panes: [{ title: "only" }] }] } as unknown as IdeConfig;
    expect(computeRelayout(single, 200, 100)).toEqual([]);
  });

  it("splits unsized rows equally via computeSizes", () => {
    const threeRows = {
      rows: [{ panes: [{ title: "r0" }] }, { panes: [{ title: "r1" }] }, { panes: [{ title: "r2" }] }],
    } as unknown as IdeConfig;
    const rowIns = computeRelayout(threeRows, 100, 100).filter((i) => i.axis === "y");
    // three unsized rows → ~33% each; first two pinned, last absorbs remainder
    expect(rowIns.map((i) => i.title)).toEqual(["r0", "r1"]);
  });
});

describe("pane-comms tmux helpers", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("parses window size from display-message", () => {
    restore = _setExecutor(() => "200\t100");
    expect(getWindowSize("sess")).toEqual({ width: 200, height: 100 });
  });

  it("returns null when the window can't be queried", () => {
    restore = _setExecutor(() => "");
    expect(getWindowSize("sess")).toBeNull();
  });

  it("issues resize-pane with the correct axis flag", () => {
    const calls: string[][] = [];
    restore = _setExecutor((_c, args) => {
      calls.push(args);
      return "";
    });
    resizePane("%1", "y", 20);
    resizePane("%2", "x", 119);
    expect(calls[0]).toEqual(["resize-pane", "-t", "%1", "-y", "20"]);
    expect(calls[1]).toEqual(["resize-pane", "-t", "%2", "-x", "119"]);
  });
});
