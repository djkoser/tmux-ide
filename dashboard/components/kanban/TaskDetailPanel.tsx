"use client";

import { CheckCircle2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  SectionHeader,
  StatusPill,
  SurfaceCard,
  type StatusPillVariant,
} from "@/components/ui";
import {
  deleteTaskApi,
  updateTask,
  type EventData,
} from "@/lib/api";
import type { AgentDetail, Goal, Task } from "@/lib/types";
import { useToasts } from "@/lib/useToasts";
import { STATUS_COLUMNS, STATUS_LABELS, type TaskStatus } from "./kanban-types";

interface TaskDetailPanelProps {
  open: boolean;
  task: Task | null;
  sessionName: string;
  agents: AgentDetail[];
  goals: Goal[];
  events: EventData[];
  allTasks: Task[];
  onOpenChange: (open: boolean) => void;
  onTaskMutated?: () => void;
}

function statusVariant(status: TaskStatus): StatusPillVariant {
  if (status === "done") return "done";
  if (status === "in-progress") return "active";
  if (status === "review") return "info";
  return "pending";
}

function eventText(event: EventData): string {
  if (event.message) return event.message;
  return `${event.type}${event.agent ? ` by ${event.agent}` : ""}`;
}

function formatProof(proof: Task["proof"]): string {
  if (!proof) return "No proof recorded";
  if (proof.notes && Object.keys(proof).length === 1) return proof.notes;
  return JSON.stringify(proof, null, 2);
}

export function TaskDetailPanel({
  open,
  task,
  sessionName,
  agents,
  goals,
  events,
  allTasks,
  onOpenChange,
  onTaskMutated,
}: TaskDetailPanelProps) {
  const { push } = useToasts();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const baselineRef = useRef<{
    title: string;
    description: string;
    priority: number;
    assignee: string | null;
  }>({ title: "", description: "", priority: 3, assignee: null });

  // Hydrate fields when task changes.
  useEffect(() => {
    if (!task) return;
    baselineRef.current = {
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      assignee: task.assignee ?? null,
    };
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setAssignee(task.assignee ?? null);
    setConfirmDelete(false);
  }, [task?.id, task]);

  const goal = useMemo(() => {
    if (!task?.goal) return null;
    return goals.find((g) => g.id === task.goal) ?? null;
  }, [goals, task]);

  const taskEvents = useMemo(() => {
    if (!task) return [];
    return events
      .filter((event) => event.taskId === task.id || event.message?.includes(task.id))
      .slice(0, 12);
  }, [events, task]);

  const dependencies = useMemo(() => {
    if (!task) return [];
    return task.depends_on.map((id) => allTasks.find((t) => t.id === id) ?? { id, status: "todo" as TaskStatus, title: id });
  }, [allTasks, task]);

  const persistFields = useCallback(
    async (fields: Parameters<typeof updateTask>[2]) => {
      if (!task) return;
      const updated = await updateTask(sessionName, task.id, fields);
      if (!updated) {
        push({
          kind: "error",
          title: "Failed to save task",
          body: task.id,
          scope: { project: sessionName },
        });
        return;
      }
      onTaskMutated?.();
    },
    [task, sessionName, push, onTaskMutated],
  );

  // Auto-save edited fields with debounce.
  useEffect(() => {
    if (!task) return;
    const baseline = baselineRef.current;
    const dirty =
      title !== baseline.title ||
      description !== baseline.description ||
      priority !== baseline.priority ||
      assignee !== baseline.assignee;
    if (!dirty) return;
    const timer = setTimeout(() => {
      void persistFields({
        title: title.trim() || baseline.title,
        description,
        priority,
        assignee: assignee ?? undefined,
      });
      baselineRef.current = { title, description, priority, assignee };
    }, 600);
    return () => clearTimeout(timer);
  }, [task, title, description, priority, assignee, persistFields]);

  async function changeStatus(status: TaskStatus) {
    if (!task) return;
    await persistFields({ status });
  }

  async function handleDelete() {
    if (!task) return;
    const ok = await deleteTaskApi(sessionName, task.id);
    if (!ok) {
      push({ kind: "error", title: "Failed to delete task", body: task.id });
      return;
    }
    onTaskMutated?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        side="right"
        data-testid="task-detail-panel"
        className="w-full max-w-[480px]"
      >
        <DialogTitle className="sr-only">{task ? `Task ${task.id}` : "Task detail"}</DialogTitle>
        {!task ? (
          <EmptyState title="No task selected" />
        ) : (
          <div className="flex h-full flex-col">
            <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border-weak)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <StatusPill
                    variant={statusVariant(task.status)}
                    label={STATUS_LABELS[task.status]}
                    testId="task-panel-status"
                  />
                  <span className="text-[11px] tabular-nums text-[var(--dim)]">{task.id}</span>
                </div>
                <input
                  data-testid="task-panel-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full bg-transparent text-[16px] font-semibold text-[var(--fg)] outline-none placeholder:text-[var(--dimmer)]"
                  placeholder="Task title"
                />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <section>
                <SectionHeader label="description" />
                <textarea
                  data-testid="task-panel-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={6}
                  className="w-full resize-y rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                  placeholder="Describe the task…"
                />
              </section>

              <section className="mt-5">
                <SectionHeader label="status" />
                <div className="flex flex-wrap gap-1">
                  {STATUS_COLUMNS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      data-testid={`task-panel-status-${col.id}`}
                      onClick={() => col.status && void changeStatus(col.status)}
                      className={`rounded-md border px-2 py-1 text-[11px] outline-none transition-colors focus-visible:focus-ring ${
                        col.status === task.status
                          ? "border-[var(--accent)] bg-[var(--surface-active)] text-[var(--fg)]"
                          : "border-[var(--border-weak)] text-[var(--dim)] hover-only:hover:text-[var(--fg)]"
                      }`}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <SectionHeader label="priority" />
                  <select
                    value={priority}
                    onChange={(event) => setPriority(Number(event.target.value))}
                    className="h-8 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value={1}>P1 — critical</option>
                    <option value={2}>P2 — high</option>
                    <option value={3}>P3 — normal</option>
                    <option value={4}>P4 — low</option>
                  </select>
                </div>
                <div>
                  <SectionHeader label="assignee" />
                  <select
                    value={assignee ?? ""}
                    onChange={(event) => setAssignee(event.target.value || null)}
                    className="h-8 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((agent) => (
                      <option key={agent.paneId} value={agent.paneTitle}>
                        {agent.paneTitle}
                      </option>
                    ))}
                  </select>
                </div>
                {goal && (
                  <div className="col-span-2">
                    <SectionHeader label="goal" />
                    <div className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-3 py-2 text-[12px] text-[var(--fg-secondary)]">
                      {goal.title}
                    </div>
                  </div>
                )}
                {task.milestone && (
                  <div>
                    <SectionHeader label="milestone" />
                    <div className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-3 py-2 text-[12px] text-[var(--magenta)]">
                      {task.milestone}
                    </div>
                  </div>
                )}
              </section>

              {dependencies.length > 0 && (
                <section className="mt-5">
                  <SectionHeader label="dependencies" />
                  <div className="flex flex-wrap gap-1">
                    {dependencies.map((dep) => {
                      const done = "status" in dep && dep.status === "done";
                      return (
                        <span
                          key={dep.id}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-1.5 py-0.5 text-[11px]"
                          style={{ color: done ? "var(--green)" : "var(--dim)" }}
                        >
                          {done ? "✓" : "○"} {dep.id}
                          {"title" in dep && dep.title !== dep.id && (
                            <span className="text-[var(--dim)]">{dep.title}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="mt-5">
                <SectionHeader label="proof" />
                <pre className="max-h-48 overflow-auto rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] p-3 text-[11px] text-[var(--fg-secondary)]">
                  {formatProof(task.proof)}
                </pre>
              </section>

              <section className="mt-5">
                <SectionHeader label="activity" />
                <SurfaceCard className="space-y-2">
                  {taskEvents.length === 0 ? (
                    <EmptyState title="No events for this task" />
                  ) : (
                    taskEvents.map((event) => (
                      <div
                        key={`${event.timestamp}:${event.type}:${event.message}`}
                        className="grid grid-cols-[auto_1fr] gap-2 text-[11px]"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        <div>
                          <div className="text-[var(--fg-secondary)]">{eventText(event)}</div>
                          <div className="tabular-nums text-[var(--dimmer)]">{event.relative}</div>
                        </div>
                      </div>
                    ))
                  )}
                </SurfaceCard>
              </section>

              <section className="mt-5 flex flex-wrap items-center gap-2">
                {task.status !== "done" && (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="task-panel-mark-done"
                    onClick={() => void changeStatus("done")}
                  >
                    <CheckCircle2 aria-hidden="true" size={13} />
                    Mark done
                  </Button>
                )}
                {confirmDelete ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      data-testid="task-panel-confirm-delete"
                      onClick={() => void handleDelete()}
                    >
                      <Trash2 aria-hidden="true" size={13} />
                      Confirm delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="task-panel-delete"
                    onClick={() => setConfirmDelete(true)}
                    className="text-[var(--red)] hover-only:hover:text-[var(--red)]"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                    Delete
                  </Button>
                )}
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
