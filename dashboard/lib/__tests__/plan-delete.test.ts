import { describe, it, expect } from "vitest";
import { deleteClick, applyDeleteResult } from "../plan-delete";

describe("deleteClick", () => {
  it("arms the confirm on first click without firing", () => {
    expect(deleteClick(null, "a.md")).toEqual({ fire: false, next: "a.md" });
  });

  it("fires and disarms on second click of the same plan", () => {
    expect(deleteClick("a.md", "a.md")).toEqual({ fire: true, next: null });
  });

  it("re-arms onto a different plan instead of firing", () => {
    // A stray click on another row must never delete the armed plan.
    expect(deleteClick("a.md", "b.md")).toEqual({ fire: false, next: "b.md" });
  });
});

describe("applyDeleteResult", () => {
  it("surfaces an error and changes nothing on failure", () => {
    const effects = applyDeleteResult(false, "a.md", "a.md");
    expect(effects.error).toBeTruthy();
    expect(effects.clearSelection).toBe(false);
    expect(effects.refresh).toBe(false);
  });

  it("clears the selection when the open plan was deleted", () => {
    expect(applyDeleteResult(true, "a.md", "a.md")).toEqual({
      error: null,
      clearSelection: true,
      refresh: true,
    });
  });

  it("keeps the selection when a different plan was deleted", () => {
    expect(applyDeleteResult(true, "a.md", "b.md")).toEqual({
      error: null,
      clearSelection: false,
      refresh: true,
    });
  });
});
