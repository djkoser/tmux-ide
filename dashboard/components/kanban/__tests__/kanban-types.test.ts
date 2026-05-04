import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import {
  buildColumns,
  columnIdForTask,
  isBlocked,
  STATUS_COLUMNS,
  taskMatchesFilters,
} from "../kanban-types";

function makeTask(overrides: Partial<Task> = {}): Task {
  const base: Task = {
    id: "001",
    title: "Sample task",
    description: "",
    goal: null,
    status: "todo",
    assignee: null,
    priority: 3,
    created: "2025-01-01T00:00:00Z",
    updated: "2025-01-01T00:00:00Z",
    tags: [],
    proof: null,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    nextRetryAt: null,
    depends_on: [],
    milestone: null,
    specialty: null,
    fulfills: [],
    discoveredIssues: [],
    salientSummary: null,
  };
  return { ...base, ...overrides };
}

describe("kanban-types", () => {
  describe("taskMatchesFilters", () => {
    it("matches when no filters are set", () => {
      const task = makeTask();
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: [],
          priorities: [],
          search: "",
        }),
      ).toBe(true);
    });

    it("filters by milestone", () => {
      const task = makeTask({ milestone: "M1" });
      expect(
        taskMatchesFilters(task, {
          milestones: ["M1"],
          agents: [],
          priorities: [],
          search: "",
        }),
      ).toBe(true);
      expect(
        taskMatchesFilters(task, {
          milestones: ["M2"],
          agents: [],
          priorities: [],
          search: "",
        }),
      ).toBe(false);
    });

    it("filters by agent", () => {
      const task = makeTask({ assignee: "alice" });
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: ["alice"],
          priorities: [],
          search: "",
        }),
      ).toBe(true);
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: ["bob"],
          priorities: [],
          search: "",
        }),
      ).toBe(false);
    });

    it("filters by priority", () => {
      const task = makeTask({ priority: 1 });
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: [],
          priorities: [1],
          search: "",
        }),
      ).toBe(true);
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: [],
          priorities: [3],
          search: "",
        }),
      ).toBe(false);
    });

    it("filters by search across id/title/description", () => {
      const task = makeTask({ id: "042", title: "Build foo bar", description: "Something" });
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: [],
          priorities: [],
          search: "foo",
        }),
      ).toBe(true);
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: [],
          priorities: [],
          search: "042",
        }),
      ).toBe(true);
      expect(
        taskMatchesFilters(task, {
          milestones: [],
          agents: [],
          priorities: [],
          search: "missing",
        }),
      ).toBe(false);
    });
  });

  describe("isBlocked", () => {
    it("returns false when there are no dependencies", () => {
      const task = makeTask();
      expect(isBlocked(task, [task])).toBe(false);
    });

    it("returns true when any dependency is not done", () => {
      const dep = makeTask({ id: "001", status: "in-progress" });
      const task = makeTask({ id: "002", depends_on: ["001"] });
      expect(isBlocked(task, [dep, task])).toBe(true);
    });

    it("returns false when all dependencies are done", () => {
      const dep = makeTask({ id: "001", status: "done" });
      const task = makeTask({ id: "002", depends_on: ["001"] });
      expect(isBlocked(task, [dep, task])).toBe(false);
    });

    it("returns true when a dependency is missing", () => {
      const task = makeTask({ id: "002", depends_on: ["099"] });
      expect(isBlocked(task, [task])).toBe(true);
    });
  });

  describe("buildColumns / columnIdForTask", () => {
    it("returns the four canonical status columns by default", () => {
      const cols = buildColumns([], "status");
      expect(cols).toEqual(STATUS_COLUMNS);
    });

    it("groups tasks by milestone with a no-milestone bucket", () => {
      const tasks = [
        makeTask({ id: "1", milestone: "M1" }),
        makeTask({ id: "2", milestone: "M2" }),
        makeTask({ id: "3" }),
      ];
      const cols = buildColumns(tasks, "milestone");
      expect(cols.map((c) => c.id)).toEqual(["M1", "M2", "__no-milestone"]);
      expect(columnIdForTask(tasks[0]!, "milestone")).toBe("M1");
      expect(columnIdForTask(tasks[2]!, "milestone")).toBe("__no-milestone");
    });

    it("groups tasks by priority", () => {
      const cols = buildColumns([], "priority");
      expect(cols.map((c) => c.id)).toEqual(["p1", "p2", "p3", "p4"]);
      expect(columnIdForTask(makeTask({ priority: 1 }), "priority")).toBe("p1");
      expect(columnIdForTask(makeTask({ priority: 4 }), "priority")).toBe("p4");
    });

    it("groups tasks by agent with an unassigned bucket", () => {
      const tasks = [makeTask({ id: "1", assignee: "alice" }), makeTask({ id: "2" })];
      const cols = buildColumns(tasks, "agent");
      expect(cols.map((c) => c.id)).toEqual(["alice", "__unassigned"]);
      expect(columnIdForTask(tasks[1]!, "agent")).toBe("__unassigned");
    });
  });
});
