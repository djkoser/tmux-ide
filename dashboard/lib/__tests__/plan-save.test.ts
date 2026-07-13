import { describe, it, expect } from "vitest";
import { decideSaveContent } from "../plan-save";

describe("decideSaveContent", () => {
  it("saves the live editor markdown", () => {
    const live = "# Plan\n\npre-edit body\n\ntyped paragraph";
    expect(decideSaveContent(live, false)).toEqual({ save: true, content: live });
  });

  it("treats an empty live document as a valid save (user cleared it)", () => {
    expect(decideSaveContent("", false)).toEqual({ save: true, content: "" });
  });

  it("BLOCKS and reports an error when serialization failed — no stale fallback", () => {
    // Regression: a serialize failure must never silently persist a snapshot.
    expect(decideSaveContent("# stale snapshot", true)).toEqual({
      save: false,
      reason: "serialize-error",
    });
  });

  it("blocks when the editor is not yet mounted", () => {
    expect(decideSaveContent(null, false)).toEqual({ save: false, reason: "not-ready" });
  });
});
