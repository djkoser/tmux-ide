/**
 * Unit tests for the chrome updater's pure parts — the adopted-session parser
 * and the tick orchestration (with injected io, no live tmux).
 */
import { describe, expect, it, vi } from "vitest";
import { adoptedSessionsFrom, runUpdaterTick } from "./updater.ts";
import { buildStatusline } from "./statusline.ts";
import type { TeamProject } from "../team/projects.ts";

function project(name: string, overrides: Partial<TeamProject> = {}): TeamProject {
  return {
    name,
    dir: `/p/${name}`,
    hasIdeYml: false,
    gitBranch: null,
    registered: true,
    running: true,
    status: "idle",
    sessions: [{ name, attached: false, windows: 1, panes: 1, status: "idle" }],
    ...overrides,
  };
}

describe("adoptedSessionsFrom", () => {
  it("keeps only sessions whose marker field is exactly 1", () => {
    const lines = ["web\t1", "api\t", "db\t1", "scratch\t0"];
    expect(adoptedSessionsFrom(lines)).toEqual(["web", "db"]);
  });

  it("ignores blank / malformed lines", () => {
    expect(adoptedSessionsFrom(["", "web\t1", "\t1", "lonely"])).toEqual(["web"]);
  });

  it("returns [] for an empty fleet", () => {
    expect(adoptedSessionsFrom([])).toEqual([]);
  });
});

describe("runUpdaterTick", () => {
  it("writes each adopted session its own bar with that session flagged active", () => {
    const projects = [project("web"), project("api")];
    const writes: Array<[string, string]> = [];
    runUpdaterTick({
      listAdopted: () => ["web", "api"],
      computeProjects: () => projects,
      writeStatus: (session, value) => writes.push([session, value]),
    });

    expect(writes.map(([s]) => s)).toEqual(["web", "api"]);
    // Each session gets the bar computed with ITSELF as the active highlight.
    expect(writes[0]![1]).toBe(buildStatusline(projects, "web"));
    expect(writes[1]![1]).toBe(buildStatusline(projects, "api"));
    // The two bars differ precisely in which project is highlighted.
    expect(writes[0]![1]).not.toBe(writes[1]![1]);
  });

  it("computes the fleet ONCE per tick, not per session", () => {
    const computeProjects = vi.fn(() => [project("web")]);
    runUpdaterTick({
      listAdopted: () => ["web", "api", "db"],
      computeProjects,
      writeStatus: () => {},
    });
    expect(computeProjects).toHaveBeenCalledTimes(1);
  });

  it("does no work (no fleet scan, no writes) when nothing is adopted", () => {
    const computeProjects = vi.fn(() => []);
    const writeStatus = vi.fn();
    runUpdaterTick({ listAdopted: () => [], computeProjects, writeStatus });
    expect(computeProjects).not.toHaveBeenCalled();
    expect(writeStatus).not.toHaveBeenCalled();
  });
});
