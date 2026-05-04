"use client";

import { ChevronDown, ChevronRight, CircleDot, Flag, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { useSessionStream } from "@/lib/useSessionStream";
import type { Goal, Task } from "@/lib/types";
import type { MilestoneData } from "@/lib/api";
import { NavigatorShell } from "./NavigatorShell";

interface MissionTreeNavigatorProps {
  sessionName: string;
}

interface GoalGroup {
  goal: Goal;
  tasks: Task[];
}

interface MilestoneGroup {
  milestone: MilestoneData | null;
  goals: GoalGroup[];
  unassignedTasks: Task[];
}

const STATUS_COLOR: Record<string, string> = {
  locked: "var(--dim)",
  active: "var(--accent)",
  validating: "var(--yellow)",
  done: "var(--green)",
  todo: "var(--dim)",
  "in-progress": "var(--accent)",
  review: "var(--yellow)",
};

function colorFor(status: string | undefined | null): string {
  if (!status) return "var(--dim)";
  return STATUS_COLOR[status] ?? "var(--dim)";
}

/**
 * Tree of mission → milestones → goals → tasks for the active project.
 * Renders inside the navigator slot when a project page is open and no
 * other view has registered an override via NavigatorPortal.
 */
export function MissionTreeNavigator({ sessionName }: MissionTreeNavigatorProps) {
  const { snapshot } = useSessionStream(sessionName);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups: MilestoneGroup[] = useMemo(() => {
    const project = snapshot?.project;
    if (!project) return [];

    const milestones = snapshot?.milestones ?? [];
    const goals = project.goals;
    const tasks = project.tasks;

    const taskByGoal = new Map<string, Task[]>();
    const goalByMilestone = new Map<string, Goal[]>();
    const orphanGoals: Goal[] = [];
    const orphanTasks: Task[] = [];

    for (const task of tasks) {
      if (task.goal) {
        const list = taskByGoal.get(task.goal) ?? [];
        list.push(task);
        taskByGoal.set(task.goal, list);
      } else {
        orphanTasks.push(task);
      }
    }

    for (const goal of goals) {
      const milestoneId = goal.milestone;
      if (milestoneId) {
        const list = goalByMilestone.get(milestoneId) ?? [];
        list.push(goal);
        goalByMilestone.set(milestoneId, list);
      } else {
        orphanGoals.push(goal);
      }
    }

    const result: MilestoneGroup[] = [];
    for (const milestone of milestones) {
      const milestoneGoals = goalByMilestone.get(milestone.id) ?? [];
      result.push({
        milestone,
        goals: milestoneGoals.map((goal) => ({
          goal,
          tasks: taskByGoal.get(goal.id) ?? [],
        })),
        unassignedTasks: [],
      });
    }

    if (orphanGoals.length > 0 || orphanTasks.length > 0) {
      result.push({
        milestone: null,
        goals: orphanGoals.map((goal) => ({
          goal,
          tasks: taskByGoal.get(goal.id) ?? [],
        })),
        unassignedTasks: orphanTasks,
      });
    }

    return result;
  }, [snapshot]);

  function toggle(key: string) {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  }

  const mission = snapshot?.mission?.mission;
  const missionStatus = mission?.status ?? "planning";

  return (
    <NavigatorShell
      title="Mission"
      subtitle={mission?.title}
      testId="mission-tree-navigator"
    >
      {!snapshot?.project ? (
        <div className="px-3 py-3 text-[11px] text-[var(--dim)]">loading project...</div>
      ) : (
        <>
          <div className="border-b border-[var(--border-weak)] px-3 py-2">
            <div className="flex items-center gap-2">
              <Flag
                aria-hidden="true"
                size={13}
                strokeWidth={1.6}
                className="shrink-0 text-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fg)]">
                {mission?.title ?? "no mission"}
              </span>
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px]"
                style={{
                  background: "var(--surface)",
                  color: colorFor(missionStatus),
                }}
              >
                {missionStatus}
              </span>
            </div>
          </div>

          <ul className="m-0 list-none p-0">
            {groups.map((group, index) => {
              const milestoneId = group.milestone?.id ?? `__orphan-${index}`;
              const milestoneCollapsed = Boolean(collapsed[`m:${milestoneId}`]);
              return (
                <li key={milestoneId}>
                  <button
                    type="button"
                    data-testid={`navigator-milestone-${milestoneId}`}
                    onClick={() => toggle(`m:${milestoneId}`)}
                    aria-expanded={!milestoneCollapsed}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    {milestoneCollapsed ? (
                      <ChevronRight aria-hidden="true" size={12} />
                    ) : (
                      <ChevronDown aria-hidden="true" size={12} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fg)]">
                      {group.milestone ? group.milestone.title : "Unassigned"}
                    </span>
                    {group.milestone && (
                      <span
                        className="shrink-0 rounded-md px-1.5 text-[10px] tabular-nums"
                        style={{
                          background: "var(--surface)",
                          color: colorFor(group.milestone.status),
                        }}
                      >
                        {group.milestone.tasksDone}/{group.milestone.taskCount}
                      </span>
                    )}
                  </button>

                  {!milestoneCollapsed && (
                    <ul className="m-0 list-none p-0">
                      {group.goals.map(({ goal, tasks }) => {
                        const goalCollapsed = Boolean(collapsed[`g:${goal.id}`]);
                        return (
                          <li key={goal.id}>
                            <button
                              type="button"
                              data-testid={`navigator-goal-${goal.id}`}
                              onClick={() => toggle(`g:${goal.id}`)}
                              aria-expanded={!goalCollapsed}
                              className="flex w-full items-center gap-2 pl-7 pr-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                            >
                              {goalCollapsed ? (
                                <ChevronRight aria-hidden="true" size={11} />
                              ) : (
                                <ChevronDown aria-hidden="true" size={11} />
                              )}
                              <Target
                                aria-hidden="true"
                                size={11}
                                strokeWidth={1.6}
                                className="shrink-0"
                                style={{ color: colorFor(goal.status) }}
                              />
                              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--fg-secondary)]">
                                {goal.title}
                              </span>
                            </button>
                            {!goalCollapsed && tasks.length > 0 && (
                              <ul className="m-0 list-none p-0">
                                {tasks.map((task) => (
                                  <li
                                    key={task.id}
                                    data-testid={`navigator-task-${task.id}`}
                                    className="flex items-center gap-2 pl-12 pr-3 py-1 text-[10px] text-[var(--dim)]"
                                  >
                                    <CircleDot
                                      aria-hidden="true"
                                      size={9}
                                      strokeWidth={1.6}
                                      style={{ color: colorFor(task.status) }}
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                      {task.id} · {task.title}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      {group.unassignedTasks.map((task) => (
                        <li
                          key={task.id}
                          data-testid={`navigator-task-${task.id}`}
                          className="flex items-center gap-2 pl-12 pr-3 py-1 text-[10px] text-[var(--dim)]"
                        >
                          <CircleDot
                            aria-hidden="true"
                            size={9}
                            strokeWidth={1.6}
                            style={{ color: colorFor(task.status) }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {task.id} · {task.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {groups.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[var(--dim)]">
                no milestones, goals, or tasks yet
              </li>
            )}
          </ul>
        </>
      )}
    </NavigatorShell>
  );
}
