"use client";

import { CheckCircle2, RotateCw, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteTaskApi, injectIntoProject, updateTask, type EventData } from "@/lib/api";
import type { AgentDetail, Goal, Task } from "@/lib/types";
import { useToasts } from "@/lib/useToasts";
import { MarkdownEditor } from "./MarkdownEditor";
import { SaveIndicator } from "./SaveIndicator";
import { EmptyState, SectionHeader, StatusPill, SurfaceCard, type StatusPillVariant } from "./ui";

interface TaskDetailPanelProps {
  task: Task;
  sessionName: string;
  agents: AgentDetail[];
  goals: Goal[];
  events: EventData[];
  onClose: () => void;
  onUpdated: () => void;
}

function statusLabel(status: Task["status"]): string {
  return status === "in-progress" ? "DOING" : status.toUpperCase();
}

function taskStatusVariant(status: Task["status"]): StatusPillVariant {
  if (status === "done") return "done";
  if (status === "in-progress") return "active";
  if (status === "review") return "info";
  return "pending";
}

function formatProof(proof: Task["proof"]): string {
  if (!proof) return "No proof recorded";
  if (proof.notes && Object.keys(proof).length === 1) return proof.notes;
  return JSON.stringify(proof, null, 2);
}

function eventText(event: EventData): string {
  if (event.message) return event.message;
  return `${event.type}${event.agent ? ` by ${event.agent}` : ""}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function TaskDetailPanel({
  task,
  sessionName,
  agents,
  goals,
  events,
  onClose,
  onUpdated,
}: TaskDetailPanelProps) {
  const { push } = useToasts();
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const baselineRef = useRef({
    title: task.title,
    description: task.description,
    priority: task.priority,
  });

  const taskEvents = useMemo(
    () =>
      events
        .filter((event) => event.taskId === task.id || event.message?.includes(task.id))
        .slice(0, 12),
    [events, task.id],
  );

  const goal = goals.find((row) => row.id === task.goal);
  const dirty =
    title !== baselineRef.current.title ||
    description !== baselineRef.current.description ||
    priority !== baselineRef.current.priority;

  useEffect(() => {
    baselineRef.current = {
      title: task.title,
      description: task.description,
      priority: task.priority,
    };
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setStatus(task.status);
    setSaveState("idle");
  }, [task.id, task.title, task.description, task.priority, task.status]);

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    if (!dirty) return;
    setSaveState("dirty");
    const timer = setTimeout(() => {
      setSaveState("saving");
      updateTask(sessionName, task.id, {
        title: title.trim() || task.title,
        description,
        priority,
      })
        .then((updated) => {
          if (!updated) {
            setTitle(baselineRef.current.title);
            setDescription(baselineRef.current.description);
            setPriority(baselineRef.current.priority);
            setSaveState("error");
            push({
              kind: "error",
              title: "Failed to save task",
              body: task.id,
              scope: { project: sessionName },
            });
            return;
          }
          baselineRef.current = {
            title: updated.title,
            description: updated.description,
            priority: updated.priority,
          };
          setTitle(updated.title);
          setDescription(updated.description);
          setPriority(updated.priority);
          setSaveState("saved");
          onUpdated();
        })
        .catch(() => {
          setTitle(baselineRef.current.title);
          setDescription(baselineRef.current.description);
          setPriority(baselineRef.current.priority);
          setSaveState("error");
          push({
            kind: "error",
            title: "Failed to save task",
            body: task.id,
            scope: { project: sessionName },
          });
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [description, dirty, onUpdated, priority, push, sessionName, task.id, task.title, title]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1200);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  async function markDone() {
    const updated = await updateTask(sessionName, task.id, { status: "done" });
    if (!updated) {
      push({ kind: "error", title: "Failed to mark task done", body: task.id });
      return;
    }
    setStatus("done");
    onUpdated();
  }

  async function sendToAgent() {
    const ok = await injectIntoProject(
      sessionName,
      `Task ${task.id}: ${title}\n\n${description}`.trim(),
      { sendEnter: true },
    );
    push({
      kind: ok ? "success" : "error",
      title: ok ? "Sent task to active agent" : "Failed to send task",
      body: task.id,
      scope: { project: sessionName },
    });
  }

  function redispatch() {
    push({
      kind: "info",
      title: "Re-dispatch coming soon",
      body: task.id,
      scope: { project: sessionName },
      durationMs: 1800,
    });
  }

  async function deleteTask() {
    const ok = await deleteTaskApi(sessionName, task.id);
    if (!ok) {
      push({ kind: "error", title: "Failed to delete task", body: task.id });
      return;
    }
    onUpdated();
    requestClose();
  }

  const saveIndicatorState =
    saveState === "saving" || saveState === "saved" || saveState === "error" ? saveState : "idle";

  return (
    <div data-testid="task-detail-panel" className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close task panel"
        onClick={requestClose}
        className={`absolute inset-0 bg-[var(--modal-overlay)] motion-safe:transition-opacity motion-safe:duration-200 ${
          closing ? "opacity-0" : "opacity-100"
        }`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out ${
          closing ? "translate-x-full" : "translate-x-0"
        }`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <StatusPill
                variant={taskStatusVariant(status)}
                label={statusLabel(status)}
                testId="task-panel-status"
              />
              <span className="text-[11px] tabular-nums text-[var(--dim)]">task {task.id}</span>
              {saveState === "dirty" && (
                <span className="text-[10px] text-[var(--dimmer)]">unsaved</span>
              )}
              <SaveIndicator state={saveIndicatorState} />
            </div>
            <input
              data-testid="task-panel-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full bg-transparent text-[18px] font-semibold text-[var(--fg)] outline-none placeholder:text-[var(--dimmer)]"
              placeholder="Task title"
            />
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex h-6 w-6 items-center justify-center text-[var(--dim)] transition-colors motion-safe:active:scale-[0.95] hover:text-[var(--fg)]"
            aria-label="Close"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section>
            <SectionHeader label="description" />
            <div className="min-h-52 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-strong)]">
              <MarkdownEditor
                key={task.id}
                value={description || ""}
                onChange={setDescription}
                onSave={setDescription}
              />
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                assignee
              </div>
              <div className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-secondary)]">
                {task.assignee || "unassigned"}
              </div>
            </div>
            <label>
              <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                priority
              </div>
              <input
                type="number"
                min={1}
                max={5}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 tabular-nums text-[var(--fg)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                goal
              </div>
              <div className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-secondary)]">
                {goal?.title || task.goal || "none"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                milestone
              </div>
              <div className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--magenta)]">
                {task.milestone || "none"}
              </div>
            </div>
          </section>

          {task.tags.length > 0 && (
            <section className="mt-4 flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--fg-secondary)]"
                >
                  #{tag}
                </span>
              ))}
            </section>
          )}

          <section className="mt-5">
            <SectionHeader label="proof" />
            <pre className="max-h-48 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-[var(--fg-secondary)]">
              {formatProof(task.proof)}
            </pre>
          </section>

          <section className="mt-5">
            <SectionHeader label="dispatch history" />
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

          <section data-testid="task-panel-actions" className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void markDone()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--green)] px-2 py-1 text-[11px] text-[var(--green)] transition-colors motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.98] hover:bg-[var(--surface-hover)]"
            >
              <CheckCircle2 aria-hidden="true" size={13} />
              Mark done
            </button>
            <button
              type="button"
              onClick={redispatch}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg-secondary)] transition-colors motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.98] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <RotateCw aria-hidden="true" size={13} />
              Re-dispatch
            </button>
            <button
              type="button"
              onClick={() => void sendToAgent()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg-secondary)] transition-colors motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.98] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Send aria-hidden="true" size={13} />
              Send to active agent
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => void deleteTask()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--red)] bg-[var(--red)] px-2 py-1 text-[11px] text-[var(--bg)] motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.98]"
                >
                  <Trash2 aria-hidden="true" size={13} />
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--dim)] motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.98]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--red)] transition-colors motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.98] hover:border-[var(--red)]"
              >
                <Trash2 aria-hidden="true" size={13} />
                Delete
              </button>
            )}
          </section>

          {agents.length > 0 && (
            <section className="mt-5">
              <SectionHeader label="agents" />
              <div className="flex flex-wrap gap-1">
                {agents.map((agent) => (
                  <span
                    key={agent.paneId}
                    className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--fg-secondary)]"
                  >
                    {agent.paneTitle}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
