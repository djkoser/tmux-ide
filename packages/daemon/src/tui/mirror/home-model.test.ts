import { describe, expect, it } from "vitest";
import {
  buildHomeItems,
  clampSelectable,
  isSelectable,
  isValidSessionName,
  REGISTRY_HEADER_LABEL,
  sessionNameFor,
  stepSelectable,
  type HomeFleetProject,
  type HomeItem,
} from "./home-model.ts";

const proj = (over: Partial<HomeFleetProject>): HomeFleetProject => ({
  name: "p",
  dir: "/tmp/p",
  registered: false,
  running: true,
  sessions: [],
  ...over,
});
const sess = (name: string, windows = 1) => ({
  name,
  status: "idle" as const,
  windows: Array.from({ length: windows }, () => ({})),
});

describe("buildHomeItems", () => {
  it("lists every project's live sessions first, in payload order", () => {
    const items = buildHomeItems([
      proj({ name: "a", sessions: [sess("a1", 2), sess("a2")] }),
      proj({ name: "b", dir: null, sessions: [sess("b1")] }),
    ]);
    expect(items).toEqual([
      { kind: "session", session: "a1", project: "a", status: "idle", windows: 2, dir: "/tmp/p" },
      { kind: "session", session: "a2", project: "a", status: "idle", windows: 1, dir: "/tmp/p" },
      { kind: "session", session: "b1", project: "b", status: "idle", windows: 1, dir: null },
    ]);
  });

  it("appends a header + one row per registered-but-not-running project", () => {
    const items = buildHomeItems([
      proj({ name: "live", sessions: [sess("live")] }),
      proj({ name: "reg", dir: "/tmp/reg", registered: true, running: false }),
    ]);
    expect(items.slice(1)).toEqual([
      { kind: "header", label: REGISTRY_HEADER_LABEL },
      { kind: "project", name: "reg", dir: "/tmp/reg" },
    ]);
  });

  it("omits the registry section when every registered project is running", () => {
    const items = buildHomeItems([
      proj({ name: "reg", registered: true, running: true, sessions: [sess("reg")] }),
    ]);
    expect(items.every((i) => i.kind === "session")).toBe(true);
  });

  it("shows only the registry section on an all-idle fleet", () => {
    const items = buildHomeItems([proj({ name: "reg", registered: true, running: false })]);
    expect(items.map((i) => i.kind)).toEqual(["header", "project"]);
  });
});

describe("selection over items", () => {
  const items: HomeItem[] = [
    { kind: "session", session: "s0", project: "p", status: "idle", windows: 1, dir: null },
    { kind: "session", session: "s1", project: "p", status: "idle", windows: 1, dir: null },
    { kind: "header", label: "h" },
    { kind: "project", name: "r0", dir: null },
  ];

  it("isSelectable: sessions and projects yes, headers and undefined no", () => {
    expect(isSelectable(items[0])).toBe(true);
    expect(isSelectable(items[2])).toBe(false);
    expect(isSelectable(items[3])).toBe(true);
    expect(isSelectable(undefined)).toBe(false);
  });

  it("clampSelectable clamps into range and skips headers downward then upward", () => {
    expect(clampSelectable(items, 0)).toBe(0);
    expect(clampSelectable(items, 99)).toBe(3); // over the end → last row (selectable)
    expect(clampSelectable(items, 2)).toBe(3); // header → next selectable below
    expect(clampSelectable(items, -5)).toBe(0);
    expect(clampSelectable([], 4)).toBe(0);
    // A trailing header falls back upward.
    const trailing: HomeItem[] = [items[0]!, { kind: "header", label: "h" }];
    expect(clampSelectable(trailing, 1)).toBe(0);
  });

  it("stepSelectable hops the header in both directions and pins at the ends", () => {
    expect(stepSelectable(items, 1, 1)).toBe(3); // s1 → r0, skipping the header
    expect(stepSelectable(items, 3, -1)).toBe(1); // r0 → s1
    expect(stepSelectable(items, 3, 1)).toBe(3); // bottom end
    expect(stepSelectable(items, 0, -1)).toBe(0); // top end
  });
});

describe("session names", () => {
  it("sessionNameFor collapses tmux-target chars and spaces to dashes", () => {
    expect(sessionNameFor("sfora.ai")).toBe("sfora-ai");
    expect(sessionNameFor("a:b c.d")).toBe("a-b-c-d");
    expect(sessionNameFor("plain")).toBe("plain");
  });

  it("isValidSessionName rejects empties, dots, colons, spaces", () => {
    expect(isValidSessionName("ok-name")).toBe(true);
    expect(isValidSessionName("")).toBe(false);
    expect(isValidSessionName("a.b")).toBe(false);
    expect(isValidSessionName("a:b")).toBe(false);
    expect(isValidSessionName("a b")).toBe(false);
  });
});
