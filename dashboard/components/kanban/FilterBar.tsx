"use client";

import { Search, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AgentDetail, Task } from "@/lib/types";
import { PRIORITY_LABELS, type KanbanFilters } from "./kanban-types";

interface FilterBarProps {
  tasks: Task[];
  agents: AgentDetail[];
  filters: KanbanFilters;
  onChange: (filters: KanbanFilters) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

export function FilterBar({
  tasks,
  agents,
  filters,
  onChange,
  onClear,
  hasActiveFilters,
}: FilterBarProps) {
  const milestones = Array.from(
    new Set(tasks.map((t) => t.milestone).filter((m): m is string => Boolean(m))),
  ).sort();
  const agentNames = Array.from(
    new Set([
      ...agents.map((a) => a.paneTitle),
      ...tasks.map((t) => t.assignee).filter((a): a is string => Boolean(a)),
    ]),
  ).sort();
  const priorities = [1, 2, 3, 4];

  function toggle<T>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
  }

  function handleSearch(event: ChangeEvent<HTMLInputElement>) {
    onChange({ ...filters, search: event.target.value });
  }

  return (
    <div
      data-testid="kanban-filter-bar"
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--border-weak)] bg-[var(--bg)] px-3 py-2"
    >
      <label className="relative">
        <Search
          aria-hidden="true"
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--dim)]"
        />
        <input
          data-testid="kanban-filter-search"
          type="search"
          value={filters.search}
          onChange={handleSearch}
          placeholder="Search tasks…"
          className="h-7 w-56 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] pl-7 pr-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus-visible:focus-ring placeholder:text-[var(--dim)]"
        />
      </label>

      {milestones.length > 0 && (
        <FilterGroup label="Milestone">
          {milestones.map((m) => (
            <Chip
              key={m}
              testId={`kanban-filter-milestone-${m}`}
              active={filters.milestones.includes(m)}
              onClick={() => onChange({ ...filters, milestones: toggle(filters.milestones, m) })}
            >
              {m}
            </Chip>
          ))}
        </FilterGroup>
      )}

      {agentNames.length > 0 && (
        <FilterGroup label="Agent">
          {agentNames.map((a) => (
            <Chip
              key={a}
              testId={`kanban-filter-agent-${a}`}
              active={filters.agents.includes(a)}
              onClick={() => onChange({ ...filters, agents: toggle(filters.agents, a) })}
            >
              @{a}
            </Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Priority">
        {priorities.map((p) => (
          <Chip
            key={p}
            testId={`kanban-filter-priority-${p}`}
            active={filters.priorities.includes(p)}
            onClick={() => onChange({ ...filters, priorities: toggle(filters.priorities, p) })}
          >
            {PRIORITY_LABELS[p]}
          </Chip>
        ))}
      </FilterGroup>

      {hasActiveFilters && (
        <Button
          size="xs"
          variant="ghost"
          onClick={onClear}
          data-testid="kanban-filter-clear"
          className="ml-auto"
        >
          <X aria-hidden="true" size={11} />
          Clear all
        </Button>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-1.5 text-[11px] outline-none transition-colors duration-150 focus-visible:focus-ring",
        active
          ? "border-[var(--accent)] bg-[rgba(91,192,222,0.1)] text-[var(--accent)]"
          : "border-[var(--border-weak)] bg-[var(--bg-strong)] text-[var(--fg-secondary)] hover-only:hover:bg-[var(--surface-hover)]",
      )}
    >
      {children}
    </button>
  );
}
