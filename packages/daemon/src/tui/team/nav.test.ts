import { describe, expect, it } from "vitest";
import { clampIndex, wrapIndex } from "./nav.ts";

describe("clampIndex", () => {
  it("clamps to zero for an empty list", () => {
    expect(clampIndex(0, 0)).toBe(0);
    expect(clampIndex(3, 0)).toBe(0);
    expect(clampIndex(3, -1)).toBe(0);
  });

  it("keeps an in-range index untouched", () => {
    expect(clampIndex(0, 3)).toBe(0);
    expect(clampIndex(2, 3)).toBe(2);
  });

  it("clamps a too-large index to the last element", () => {
    expect(clampIndex(3, 3)).toBe(2);
    expect(clampIndex(99, 3)).toBe(2);
  });

  it("clamps a negative index to the first element", () => {
    expect(clampIndex(-5, 3)).toBe(0);
  });
});

describe("wrapIndex", () => {
  it("returns zero for an empty list", () => {
    expect(wrapIndex(0, 1, 0)).toBe(0);
    expect(wrapIndex(2, -1, 0)).toBe(0);
  });

  it("moves forward without wrapping", () => {
    expect(wrapIndex(0, 1, 3)).toBe(1);
    expect(wrapIndex(1, 1, 3)).toBe(2);
  });

  it("wraps forward off the end back to the start", () => {
    expect(wrapIndex(2, 1, 3)).toBe(0);
  });

  it("wraps backward off the start to the end", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
  });

  it("handles a delta larger than the list length", () => {
    expect(wrapIndex(0, 4, 3)).toBe(1);
    expect(wrapIndex(0, -4, 3)).toBe(2);
  });
});
