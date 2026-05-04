import type { Task } from "@/lib/types";

export type TaskStatus = Task["status"];

export type GroupBy = "status" | "milestone" | "agent" | "priority";

export type Density = "comfortable" | "compact";

export interface ColumnDef {
  id: string;
  label: string;
  status?: TaskStatus;
  /** Color used for the status dot/indicator. */
  color: string;
}

export const STATUS_COLUMNS: ColumnDef[] = [
  { id: "todo", label: "Todo", status: "todo", color: "var(--dim)" },
  { id: "in-progress", label: "In Progress", status: "in-progress", color: "var(--yellow)" },
  { id: "review", label: "In Review", status: "review", color: "var(--magenta)" },
  { id: "done", label: "Done", status: "done", color: "var(--green)" },
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  review: "In Review",
  done: "Done",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "var(--dim)",
  "in-progress": "var(--yellow)",
  review: "var(--magenta)",
  done: "var(--green)",
};

export interface KanbanFilters {
  milestones: string[];
  agents: string[];
  priorities: number[];
  search: string;
}

export const EMPTY_FILTERS: KanbanFilters = {
  milestones: [],
  agents: [],
  priorities: [],
  search: "",
};

/** Pure: returns true when the task matches all filters. */
export function taskMatchesFilters(task: Task, filters: KanbanFilters): boolean {
  if (filters.milestones.length > 0) {
    if (!task.milestone || !filters.milestones.includes(task.milestone)) return false;
  }
  if (filters.agents.length > 0) {
    if (!task.assignee || !filters.agents.includes(task.assignee)) return false;
  }
  if (filters.priorities.length > 0) {
    if (!filters.priorities.includes(task.priority)) return false;
  }
  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = `${task.title} ${task.description ?? ""} ${task.id}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** Returns true when any of `task.depends_on` is unresolved (not done) in `tasks`. */
export function isBlocked(task: Task, tasks: Task[]): boolean {
  if (!task.depends_on?.length) return false;
  for (const depId of task.depends_on) {
    const dep = tasks.find((t) => t.id === depId);
    if (!dep || dep.status !== "done") return true;
  }
  return false;
}

/** Pure: groups tasks into columns by the supplied groupBy mode. */
export function buildColumns(tasks: Task[], groupBy: GroupBy): ColumnDef[] {
  if (groupBy === "status") return STATUS_COLUMNS;
  if (groupBy === "priority") {
    return [
      { id: "p1", label: "P1 — critical", color: "var(--red)" },
      { id: "p2", label: "P2 — high", color: "var(--yellow)" },
      { id: "p3", label: "P3 — normal", color: "var(--accent)" },
      { id: "p4", label: "P4 — low", color: "var(--dim)" },
    ];
  }
  if (groupBy === "milestone") {
    const ids = Array.from(
      new Set(tasks.map((t) => t.milestone).filter((m): m is string => Boolean(m))),
    ).sort();
    const cols: ColumnDef[] = ids.map((id) => ({
      id,
      label: id,
      color: "var(--magenta)",
    }));
    cols.push({ id: "__no-milestone", label: "No milestone", color: "var(--dim)" });
    return cols;
  }
  // agent
  const agents = Array.from(
    new Set(tasks.map((t) => t.assignee).filter((a): a is string => Boolean(a))),
  ).sort();
  const cols: ColumnDef[] = agents.map((id) => ({
    id,
    label: `@${id}`,
    color: "var(--cyan)",
  }));
  cols.push({ id: "__unassigned", label: "Unassigned", color: "var(--dim)" });
  return cols;
}

/** Returns the column id a task belongs to under a given groupBy. */
export function columnIdForTask(task: Task, groupBy: GroupBy): string {
  if (groupBy === "status") return task.status;
  if (groupBy === "priority") {
    if (task.priority <= 1) return "p1";
    if (task.priority === 2) return "p2";
    if (task.priority === 3) return "p3";
    return "p4";
  }
  if (groupBy === "milestone") return task.milestone ?? "__no-milestone";
  return task.assignee ?? "__unassigned";
}

export const PRIORITY_LABELS: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: "var(--red)",
  2: "var(--yellow)",
  3: "var(--accent)",
  4: "var(--dim)",
};
