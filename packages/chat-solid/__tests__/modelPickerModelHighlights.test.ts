/**
 * The highlight helpers are intentionally static — they're a hand-
 * curated allow-list for the "NEW" / "RECOMMENDED" chips. These
 * tests cover the lookup shape so a future tweak that breaks the
 * `${driverKind}:${slug}` keying surfaces immediately.
 */

import { describe, expect, it } from "vitest";
import {
  isModelPickerNewModel,
  isModelPickerRecommendedModel,
} from "../src/lib/modelPickerModelHighlights";

describe("isModelPickerNewModel", () => {
  it("returns false for unflagged models", () => {
    expect(isModelPickerNewModel("claude-code", "claude-opus-4-7")).toBe(false);
  });

  it("scopes by driver kind so the same slug under another driver doesn't leak", () => {
    expect(isModelPickerNewModel("codex", "claude-opus-4-7")).toBe(false);
  });
});

describe("isModelPickerRecommendedModel", () => {
  it("returns false for unflagged models", () => {
    expect(isModelPickerRecommendedModel("claude-code", "claude-opus-4-7")).toBe(false);
  });
});
