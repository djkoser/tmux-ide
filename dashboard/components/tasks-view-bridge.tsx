"use client";

/**
 * React → Solid bridge for the TasksView widget.
 *
 * Mirrors the mission-control-bridge / diffs-viewer-bridge pattern:
 *   - Mount once on `useEffect([])`, never on prop change.
 *   - Push prop updates (tasks, goals, milestones) through
 *     `handle.setOptions({ ... })`.
 *   - User events flow Solid → React via onTaskClick (routes to the
 *     kanban detail) and onCreateTask (opens the legacy create dialog).
 *
 * ADR-0001 §1.4 Rule 4: this is the *only* `*Bridge.tsx` allowed to
 * call mount() for the TasksView widget. Anything else that needs task
 * data should call the silo's React-shaped wrapper or fetch the JSON
 * directly.
 */

import { useCallback, useEffect, useRef } from "react";
import type { Task, GoalDetail } from "@/lib/types";

interface TasksViewBridgeProps {
  projectName: string;
  tasks: ReadonlyArray<Task>;
  goals?: ReadonlyArray<GoalDetail>;
  /**
   * Fired when the user clicks "+ New task" in the toolbar. Pass
   * undefined to hide the create button entirely.
   */
  onCreateTask?: () => void;
}

interface BridgeTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  assignee?: string | null;
  goal?: string | null;
  milestone?: string | null;
  depends_on?: ReadonlyArray<string>;
  tags?: ReadonlyArray<string>;
  description?: string | null;
  created?: string;
  updated?: string;
}

interface BridgeGoal {
  id: string;
  title: string;
}

interface TasksViewMountHandle {
  unmount(): void;
  setOptions(next: {
    tasks?: ReadonlyArray<BridgeTask>;
    goals?: ReadonlyArray<BridgeGoal>;
    onTaskClick?: (taskId: string) => void;
    onCreateTask?: () => void;
  }): void;
}

function normalizeTasks(tasks: ReadonlyArray<Task>): BridgeTask[] {
  return tasks.map((t) => {
    const normalized: BridgeTask = {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    };
    if (t.assignee !== undefined) normalized.assignee = t.assignee;
    if (t.goal !== undefined) normalized.goal = t.goal;
    if ((t as { milestone?: string | null }).milestone !== undefined) {
      normalized.milestone = (t as { milestone?: string | null }).milestone;
    }
    if ((t as { depends_on?: string[] }).depends_on) {
      normalized.depends_on = (t as { depends_on: string[] }).depends_on;
    }
    if (t.tags) normalized.tags = t.tags;
    if (t.description !== undefined) normalized.description = t.description;
    if (t.created !== undefined) normalized.created = t.created;
    if (t.updated !== undefined) normalized.updated = t.updated;
    return normalized;
  });
}

function normalizeGoals(goals?: ReadonlyArray<GoalDetail>): BridgeGoal[] {
  if (!goals) return [];
  return goals.map((g) => ({ id: g.id, title: g.title }));
}

export function TasksViewBridge({
  projectName,
  tasks,
  goals,
  onCreateTask,
}: TasksViewBridgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<TasksViewMountHandle | null>(null);

  // Routing on row click: navigate to the kanban detail with ?task=ID.
  const handleTaskClick = useCallback((taskId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "kanban");
    url.searchParams.set("task", taskId);
    window.history.replaceState(null, "", url.toString());
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const onCreateTaskRef = useRef(onCreateTask);
  onCreateTaskRef.current = onCreateTask;

  // (1) Mount once. ADR-0001 §1.3 — empty deps; subsequent prop updates
  //     flow through setOptions below.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountTasksView(el, {
        tasks: normalizeTasks(tasks),
        goals: normalizeGoals(goals),
        onTaskClick: handleTaskClick,
        ...(onCreateTaskRef.current
          ? { onCreateTask: () => onCreateTaskRef.current?.() }
          : {}),
      });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (2) Dispatch tasks updates via setter, one effect per prop family.
  useEffect(() => {
    handleRef.current?.setOptions({ tasks: normalizeTasks(tasks) });
  }, [tasks]);

  useEffect(() => {
    handleRef.current?.setOptions({ goals: normalizeGoals(goals) });
  }, [goals]);

  return (
    <div
      ref={containerRef}
      data-testid="tasks-view-bridge"
      data-project-name={projectName}
      style={{ display: "flex", flex: "1 1 0%", minHeight: 0, minWidth: 0, width: "100%" }}
    />
  );
}
