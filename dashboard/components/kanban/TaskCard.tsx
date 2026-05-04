"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Link2 } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type Density,
  type TaskStatus,
} from "./kanban-types";

interface TaskCardProps {
  task: Task;
  density: Density;
  selected: boolean;
  blocked: boolean;
  /** When true, renders without dnd hooks (used inside DragOverlay). */
  overlay?: boolean;
  onOpen?: () => void;
  onSelect?: (event: MouseEvent | KeyboardEvent) => void;
  onStatusChange?: (status: TaskStatus) => void;
}

export function TaskCard({
  task,
  density,
  selected,
  blocked,
  overlay,
  onOpen,
  onSelect,
  onStatusChange,
}: TaskCardProps) {
  const sortable = useSortable({
    id: task.id,
    data: { type: "task", taskId: task.id, status: task.status },
    disabled: overlay,
  });

  const style: CSSProperties | undefined = overlay
    ? undefined
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.3 : 1,
      };

  function handleClick(event: MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      onSelect?.(event);
      return;
    }
    onOpen?.();
  }

  function handleStatusClick(event: MouseEvent) {
    event.stopPropagation();
    if (!onStatusChange) return;
    // Cycle through statuses on click. Right-click / context menu should
    // open a fuller picker — wired in at the parent level.
    const order: TaskStatus[] = ["todo", "in-progress", "review", "done"];
    const next = order[(order.indexOf(task.status) + 1) % order.length]!;
    onStatusChange(next);
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen?.();
    } else if (event.key === " ") {
      event.preventDefault();
      onSelect?.(event);
    }
  }

  const compact = density === "compact";

  return (
    <motion.div
      ref={overlay ? undefined : sortable.setNodeRef}
      layout={!overlay}
      style={style}
      data-testid={`task-card-${task.id}`}
      data-task-id={task.id}
      data-selected={selected ? "true" : "false"}
      data-blocked={blocked ? "true" : "false"}
      data-dragging={sortable.isDragging ? "true" : "false"}
      className={cn(
        "group relative cursor-pointer rounded-md border bg-[var(--bg-strong)] outline-none transition-colors duration-150",
        compact ? "px-2 py-1.5" : "px-3 py-2",
        selected
          ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
          : "border-[var(--border-weak)] hover-only:hover:border-[var(--border)] hover-only:hover:bg-[var(--surface-hover)]",
        overlay && "rotate-1 shadow-2xl",
      )}
      {...(!overlay ? { ...sortable.attributes, ...sortable.listeners } : {})}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-testid={`task-card-status-${task.id}`}
          onClick={handleStatusClick}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Status ${STATUS_LABELS[task.status]}`}
          className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ background: STATUS_COLORS[task.status] }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[10px] tabular-nums text-[var(--dim)]">
              {task.id}
            </span>
            <span
              className="text-[10px] uppercase tracking-wide"
              style={{ color: PRIORITY_COLORS[task.priority] ?? "var(--dim)" }}
              title={`Priority ${task.priority}`}
            >
              {PRIORITY_LABELS[task.priority] ?? `P${task.priority}`}
            </span>
            {task.milestone && (
              <span
                data-testid={`task-card-milestone-${task.id}`}
                className="rounded-sm bg-[var(--surface)] px-1 text-[10px] text-[var(--magenta)]"
              >
                {task.milestone}
              </span>
            )}
            {blocked && (
              <span
                data-testid={`task-card-blocked-${task.id}`}
                className="inline-flex items-center gap-1 rounded-sm bg-[rgba(252,213,58,0.1)] px-1 text-[10px] text-[var(--yellow)]"
                title="Blocked by dependencies"
              >
                Blocked
              </span>
            )}
          </div>
          <div
            className={cn(
              "mt-1 truncate text-[var(--fg)]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {task.title}
          </div>
          {!compact && task.description && (
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--dim)]">
              {task.description}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--dim)]">
            {task.assignee && <span className="text-[var(--cyan)]">@{task.assignee}</span>}
            {task.depends_on?.length > 0 && (
              <span
                data-testid={`task-card-deps-${task.id}`}
                className="inline-flex items-center gap-0.5"
                title={`Depends on ${task.depends_on.join(", ")}`}
              >
                <Link2 aria-hidden="true" size={10} />
                {task.depends_on.length}
              </span>
            )}
            {task.proof?.tests && task.proof.tests.passed === task.proof.tests.total && (
              <span className="text-[var(--green)]">
                ✓ {task.proof.tests.passed}/{task.proof.tests.total}
              </span>
            )}
            {task.proof?.pr && <span className="text-[var(--cyan)]">PR#{task.proof.pr.number}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
