import { describe, it, expect } from "bun:test";
import { buildPaneIndex, applyRelayout } from "./relayout.ts";
import type { PaneInfo } from "./widgets/lib/pane-comms.ts";
import type { IdeConfig } from "./types.ts";

function pane(over: Partial<PaneInfo>): PaneInfo {
  return {
    id: "%0",
    index: 0,
    title: "",
    currentCommand: "zsh",
    width: 80,
    height: 24,
    active: false,
    role: null,
    name: null,
    type: null,
    ...over,
  };
}

describe("buildPaneIndex", () => {
  it("resolves by @ide_name (the launch-stamped identity)", () => {
    const idx = buildPaneIndex([pane({ id: "%1", name: "team-input", title: "zsh" })]);
    expect(idx.get("team-input")).toBe("%1");
  });

  it("falls back to the glyph-stripped title when @ide_name is absent", () => {
    // Agent panes carry a leading busy glyph mid-turn ("⠙ lead").
    const idx = buildPaneIndex([pane({ id: "%2", name: null, title: "⠙ lead" })]);
    expect(idx.get("lead")).toBe("%2");
    expect(idx.get("⠙ lead")).toBe("%2"); // raw title also indexed
  });

  it("lets @ide_name win when a title collides with another pane's name", () => {
    // A shell pane renamed its title to "lead"; the real lead is another pane.
    const idx = buildPaneIndex([
      pane({ id: "%shell", name: "team-input", title: "lead" }),
      pane({ id: "%lead", name: "lead", title: "⠋ lead" }),
    ]);
    expect(idx.get("lead")).toBe("%lead");
  });
});

describe("applyRelayout (launch-time + relayout sizing)", () => {
  const cfg = {
    rows: [
      { size: "12%", panes: [{ title: "team-input" }] },
      { size: "45%", panes: [{ title: "lead", size: "60%" }, { title: "validator" }] },
      { panes: [{ title: "cw1" }] },
    ],
  } as unknown as IdeConfig;

  it("pins the first row's height by resolving team-input — the bug the fix closes", () => {
    // team-input has no live @ide_name-matching title (shell renamed it to "zsh")
    // but launch stamped @ide_name=team-input, so the first-row height resolves.
    const panes: PaneInfo[] = [
      pane({ id: "%ti", name: "team-input", title: "zsh" }),
      pane({ id: "%lead", name: "lead", title: "⠋ lead" }),
      pane({ id: "%val", name: "validator", title: "validator" }),
      pane({ id: "%cw1", name: "cw1", title: "cw1" }),
    ];
    const resizes: { paneId: string; axis: "x" | "y"; size: number }[] = [];
    const applied = applyRelayout(cfg, "sess", 200, 100, {
      listPanes: () => panes,
      resize: (paneId, axis, size) => resizes.push({ paneId, axis, size }),
    });

    // First-row height instruction resolved to team-input and was applied.
    const firstRow = resizes.find((r) => r.paneId === "%ti");
    expect(firstRow).toEqual({ paneId: "%ti", axis: "y", size: 12 }); // usableH 98*12% ≈ 12
    // The glyph-decorated lead title still resolved via @ide_name.
    expect(applied.some((i) => i.title === "lead" && i.axis === "x")).toBe(true);
    expect(resizes.some((r) => r.paneId === "%lead" && r.axis === "x")).toBe(true);
  });

  it("skips instructions whose pane is absent instead of throwing", () => {
    const applied = applyRelayout(cfg, "sess", 200, 100, {
      listPanes: () => [pane({ id: "%lead", name: "lead", title: "lead" })],
      resize: () => {},
    });
    // Only the lead pane is present, so team-input's height and validator's
    // width are skipped. lead is the first pane of its row, so it takes both a
    // row-height (y) and an in-row width (x) instruction.
    expect(applied.map((i) => `${i.title}:${i.axis}`)).toEqual(["lead:y", "lead:x"]);
  });
});
