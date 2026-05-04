"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupBy } from "./kanban-types";

interface GroupByToggleProps {
  value: GroupBy;
  onChange: (next: GroupBy) => void;
}

const OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "milestone", label: "Milestone" },
  { value: "agent", label: "Agent" },
  { value: "priority", label: "Priority" },
];

export function GroupByToggle({ value, onChange }: GroupByToggleProps) {
  return (
    <div
      data-testid="kanban-groupby-toggle"
      className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-1 text-[11px]"
    >
      <Layers aria-hidden="true" size={11} className="ml-1 text-[var(--dim)]" />
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-testid={`kanban-groupby-${opt.value}`}
          data-active={opt.value === value ? "true" : "false"}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-1.5 py-0.5 outline-none transition-colors focus-visible:focus-ring",
            opt.value === value
              ? "bg-[var(--surface-active)] text-[var(--fg)]"
              : "text-[var(--dim)] hover-only:hover:text-[var(--fg)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
