import { describe, expect, it } from "vitest";
import { previewLines } from "./preview.ts";

describe("previewLines", () => {
  it("drops trailing blank lines but keeps internal blanks", () => {
    const raw = "a\n\nb\n\n\n";
    expect(previewLines(raw, 10, 80)).toEqual(["a", "", "b"]);
  });

  it("returns the last N lines", () => {
    const raw = ["1", "2", "3", "4", "5"].join("\n");
    expect(previewLines(raw, 2, 80)).toEqual(["4", "5"]);
  });

  it("truncates each line to maxWidth", () => {
    const raw = "hello world\nshort";
    expect(previewLines(raw, 10, 5)).toEqual(["hello", "short"]);
  });

  it("returns [] for empty input", () => {
    expect(previewLines("", 10, 80)).toEqual([]);
  });

  it("returns [] for whitespace-only input", () => {
    expect(previewLines("   \n\t\n  ", 10, 80)).toEqual([]);
  });

  it("does not truncate when maxWidth <= 0", () => {
    const raw = "a very long line that exceeds nothing";
    expect(previewLines(raw, 10, 0)).toEqual([raw]);
    expect(previewLines(raw, 10, -5)).toEqual([raw]);
  });

  it("returns all lines when maxLines exceeds available", () => {
    const raw = "one\ntwo\nthree";
    expect(previewLines(raw, 100, 80)).toEqual(["one", "two", "three"]);
  });

  it("never throws and keeps internal blanks within the tail window", () => {
    const raw = "top\nmid\n\nlast\n\n";
    // trailing blanks dropped → ["top","mid","","last"]; last 3 kept
    expect(previewLines(raw, 3, 80)).toEqual(["mid", "", "last"]);
  });
});
