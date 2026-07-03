import { describe, expect, it } from "vitest";
import { spans, spanHit } from "./spans.ts";

describe("spans", () => {
  it("lays out contiguous labels from startX with gap=0 (surface tab bar)", () => {
    // ` ⌂ Home ` (8) · ` ❯ Terminal ` (12) — single-width glyphs, no gap.
    expect(spans([" ⌂ Home ", " ❯ Terminal "], 0, 0)).toEqual([
      { start: 0, width: 8 },
      { start: 8, width: 12 },
    ]);
  });

  it("offsets by startX and inserts gap cells between labels (window strip)", () => {
    // startX=25 (SIDEBAR_W 24 + paddingLeft 1), gap=1 between segments.
    expect(spans([" 0:main ", " 1:log "], 25, 1)).toEqual([
      { start: 25, width: 8 },
      { start: 34, width: 7 }, // 25 + 8 + 1 gap
    ]);
  });

  it("returns an empty layout for no labels", () => {
    expect(spans([], 5, 1)).toEqual([]);
  });

  it("uses string length as width regardless of content", () => {
    expect(spans(["ab", "cde"], 0, 0)).toEqual([
      { start: 0, width: 2 },
      { start: 2, width: 3 },
    ]);
  });
});

describe("spanHit", () => {
  const list = spans([" ⌂ Home ", " ❯ Terminal "], 0, 0);

  it("hits the label covering x (inclusive start)", () => {
    expect(spanHit(list, 0)).toBe(0);
    expect(spanHit(list, 7)).toBe(0);
    expect(spanHit(list, 8)).toBe(1);
    expect(spanHit(list, 19)).toBe(1);
  });

  it("misses past the last span", () => {
    expect(spanHit(list, 20)).toBe(-1);
    expect(spanHit(list, 100)).toBe(-1);
  });

  it("misses gap cells between spans", () => {
    const gapped = spans([" a ", " b "], 25, 1);
    expect(spanHit(gapped, 24)).toBe(-1); // before startX
    expect(spanHit(gapped, 25)).toBe(0);
    expect(spanHit(gapped, 27)).toBe(0);
    expect(spanHit(gapped, 28)).toBe(-1); // the gap cell
    expect(spanHit(gapped, 29)).toBe(1);
  });

  it("misses on an empty layout", () => {
    expect(spanHit([], 0)).toBe(-1);
  });
});
