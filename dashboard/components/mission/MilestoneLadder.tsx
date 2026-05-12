"use client";

import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Circle, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { StatusPill } from "@/components/ui";
import type { MilestoneData } from "@/lib/api";
import type { Task } from "@/lib/types";
import { milestoneVariant, percent } from "./utils";

interface MilestoneLadderProps {
  milestones: MilestoneData[];
  tasksByMilestone: Map<string, Task[]>;
  onTaskClick?: (task: Task) => void;
  validationByMilestone?: Map<string, { passed: boolean }>;
}

function StationIcon({ status }: { status: MilestoneData["status"] }) {
  if (status === "done") {
    return (
      <CheckCircle2
        aria-hidden="true"
        size={20}
        strokeWidth={1.6}
        className="text-[var(--green)]"
      />
    );
  }
  if (status === "active") {
    return (
      <motion.span
        initial={{ scale: 0.95 }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex"
      >
        <Loader2
          aria-hidden="true"
          size={20}
          strokeWidth={1.6}
          className="text-[var(--accent)] motion-safe:animate-spin"
          style={{ animationDuration: "3s" }}
        />
      </motion.span>
    );
  }
  if (status === "validating") {
    return (
      <Loader2 aria-hidden="true" size={20} strokeWidth={1.6} className="text-[var(--yellow)]" />
    );
  }
  return <Lock aria-hidden="true" size={18} strokeWidth={1.6} className="text-[var(--dim)]" />;
}

function statusLabel(status: MilestoneData["status"]): string {
  if (status === "done") return "done";
  if (status === "active") return "active";
  if (status === "validating") return "validating";
  return "pending";
}

export function MilestoneLadder({
  milestones,
  tasksByMilestone,
  onTaskClick,
  validationByMilestone,
}: MilestoneLadderProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = [...milestones].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) return null;

  return (
    <section data-testid="mission-milestone-ladder" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">Milestones</h2>
        <span className="text-[10px] tabular-nums text-[var(--dim)]">{sorted.length}</span>
      </div>

      <ol className="relative grid gap-2 sm:grid-flow-col sm:auto-cols-fr">
        {sorted.map((m, idx) => {
          const tasks = tasksByMilestone.get(m.id) ?? [];
          const expanded = expandedId === m.id;
          const isLast = idx === sorted.length - 1;
          const validation = validationByMilestone?.get(m.id);
          const validationFail = validation && !validation.passed;
          return (
            <li key={m.id} data-testid={`milestone-station-${m.id}`} className="relative min-w-0">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : m.id)}
                aria-expanded={expanded}
                className={`flex w-full min-w-0 items-start gap-3 rounded-md border p-3 text-left transition-colors hover-only:hover:bg-[var(--surface-hover)] focus-visible:focus-ring ${
                  m.status === "active"
                    ? "border-[var(--accent)] bg-[var(--surface)]"
                    : "border-[var(--border-weak)] bg-[var(--bg-strong)]"
                } ${validationFail ? "ring-1 ring-[var(--yellow)]" : ""}`}
                data-testid={`milestone-button-${m.id}`}
              >
                <span className="shrink-0 pt-0.5">
                  <StationIcon status={m.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                      {m.id}
                    </span>
                    <StatusPill
                      variant={milestoneVariant(m.status)}
                      label={statusLabel(m.status)}
                    />
                  </span>
                  <span className="mt-1 block truncate text-[13px] font-medium text-[var(--fg)]">
                    {m.title}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-[var(--dim)]">
                    <span>
                      {m.tasksDone}/{m.taskCount} tasks
                    </span>
                    <span className="h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-[var(--surface)]">
                      <motion.span
                        initial={false}
                        animate={{ width: `${percent(m.tasksDone, m.taskCount)}%` }}
                        transition={{ type: "spring", stiffness: 600, damping: 49 }}
                        className="block h-full"
                        style={{
                          background: m.status === "done" ? "var(--green)" : "var(--accent)",
                        }}
                      />
                    </span>
                  </span>
                </span>
              </button>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-[-6px] top-1/2 hidden h-px w-3 -translate-y-1/2 bg-[var(--border)] sm:block"
                />
              )}

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="expand"
                    data-testid={`milestone-expanded-${m.id}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 600, damping: 49 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-md border border-[var(--border-weak)] bg-[var(--bg)] p-2">
                      {tasks.length === 0 ? (
                        <p className="px-2 py-3 text-[11px] text-[var(--dim)]">
                          No tasks under this milestone yet.
                        </p>
                      ) : (
                        <ul className="m-0 list-none space-y-1 p-0">
                          {tasks.map((task) => (
                            <li
                              key={task.id}
                              data-testid={`milestone-task-${task.id}`}
                              className="group/task"
                            >
                              <button
                                type="button"
                                onClick={() => onTaskClick?.(task)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover-only:hover:bg-[var(--surface-hover)]"
                              >
                                <Circle
                                  aria-hidden="true"
                                  size={9}
                                  strokeWidth={1.6}
                                  style={{
                                    color:
                                      task.status === "done"
                                        ? "var(--green)"
                                        : task.status === "in-progress"
                                          ? "var(--accent)"
                                          : task.status === "review"
                                            ? "var(--yellow)"
                                            : "var(--dim)",
                                  }}
                                />
                                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fg)]">
                                  {task.title}
                                </span>
                                <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                                  {task.status}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
