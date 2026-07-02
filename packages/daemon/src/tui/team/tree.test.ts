import { describe, expect, it } from "vitest";
import { treeNodes, findCursor, type TreeProjectLike } from "./tree.ts";

/** Build a project fixture with `sessionWindowCounts[i]` windows per session. */
function proj(sessionWindowCounts: number[]): TreeProjectLike {
  return {
    sessions: sessionWindowCounts.map((n) => ({
      windowList: Array.from({ length: n }, (_, i) => i),
    })),
  };
}

describe("treeNodes — picker (active project only)", () => {
  it("expands only the active project's sessions", () => {
    const projects = [proj([1]), proj([1, 1])];
    const nodes = treeNodes(projects, 1, -1);
    // project 0 row (collapsed), project 1 row + its 2 sessions
    expect(nodes).toEqual([
      { pi: 0, si: -1, wi: -1 },
      { pi: 1, si: -1, wi: -1 },
      { pi: 1, si: 0, wi: -1 },
      { pi: 1, si: 1, wi: -1 },
    ]);
  });

  it("expands windows only under the active session", () => {
    const nodes = treeNodes([proj([2, 1])], 0, 0);
    expect(nodes).toEqual([
      { pi: 0, si: -1, wi: -1 },
      { pi: 0, si: 0, wi: -1 },
      { pi: 0, si: 0, wi: 0 },
      { pi: 0, si: 0, wi: 1 },
      { pi: 0, si: 1, wi: -1 },
    ]);
  });
});

describe("treeNodes — sidebar (all projects expanded)", () => {
  it("lists every project's sessions", () => {
    const projects = [proj([1]), proj([1, 1])];
    const nodes = treeNodes(projects, 0, -1, { expandAllProjects: true });
    expect(nodes).toEqual([
      { pi: 0, si: -1, wi: -1 },
      { pi: 0, si: 0, wi: -1 },
      { pi: 1, si: -1, wi: -1 },
      { pi: 1, si: 0, wi: -1 },
      { pi: 1, si: 1, wi: -1 },
    ]);
  });

  it("still expands windows only under the ONE active session", () => {
    // p0 has two sessions (2 windows each); p1 one session (2 windows). With the
    // cursor on p0/s0, windows appear ONLY there — never under p0/s1 or p1/s0.
    const projects = [proj([2, 2]), proj([2])];
    const nodes = treeNodes(projects, 0, 0, { expandAllProjects: true });
    expect(nodes.filter((n) => n.wi >= 0)).toEqual([
      { pi: 0, si: 0, wi: 0 },
      { pi: 0, si: 0, wi: 1 },
    ]);
  });
});

describe("findCursor", () => {
  it("locates a cursor triple in the node union", () => {
    const nodes = treeNodes([proj([2])], 0, 0);
    expect(findCursor(nodes, { pi: 0, si: 0, wi: 1 })).toBe(3);
  });

  it("returns -1 when the cursor row is gone", () => {
    const nodes = treeNodes([proj([1])], 0, -1);
    expect(findCursor(nodes, { pi: 5, si: 5, wi: 5 })).toBe(-1);
  });
});
