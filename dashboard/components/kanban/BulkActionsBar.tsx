"use client";

import { Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui";
import { STATUS_COLUMNS, type TaskStatus } from "./kanban-types";

interface BulkActionsBarProps {
  count: number;
  onClear: () => void;
  onSetStatus: (status: TaskStatus) => void;
  onDelete: () => void;
}

export function BulkActionsBar({ count, onClear, onSetStatus, onDelete }: BulkActionsBarProps) {
  if (count === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", stiffness: 600, damping: 40 }}
      data-testid="kanban-bulk-actions"
      className="pointer-events-auto fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--bg-strong)] px-2 py-1.5 shadow-2xl"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] tabular-nums text-[var(--fg)]">
          {count} selected
        </span>
        <span className="h-4 w-px bg-[var(--border-weak)]" />
        <span className="text-[10px] uppercase tracking-wide text-[var(--dim)]">Move to</span>
        {STATUS_COLUMNS.map((col) => (
          <Button
            key={col.id}
            size="xs"
            variant="ghost"
            data-testid={`kanban-bulk-status-${col.id}`}
            onClick={() => col.status && onSetStatus(col.status)}
          >
            {col.label}
          </Button>
        ))}
        <span className="h-4 w-px bg-[var(--border-weak)]" />
        <Button
          size="xs"
          variant="ghost"
          data-testid="kanban-bulk-delete"
          onClick={onDelete}
          className="text-[var(--red)] hover-only:hover:text-[var(--red)]"
        >
          <Trash2 aria-hidden="true" size={11} />
          Delete
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          data-testid="kanban-bulk-clear"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X aria-hidden="true" size={11} />
        </Button>
      </div>
    </motion.div>
  );
}
