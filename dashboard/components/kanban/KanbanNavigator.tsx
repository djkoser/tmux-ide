"use client";

import { Filter, Group, Layers } from "lucide-react";
import { PanelHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { PRIORITY_LABELS, type GroupBy, type KanbanFilters } from "./kanban-types";

interface KanbanNavigatorProps {
  tasks: Task[];
  filters: KanbanFilters;
  onChangeFilters: (filters: KanbanFilters) => void;
  groupBy: GroupBy;
  onChangeGroupBy: (next: GroupBy) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function KanbanNavigator({
  tasks,
  filters,
  onChangeFilters,
  groupBy,
  onChangeGroupBy,
  hasActiveFilters,
  onClearFilters,
}: KanbanNavigatorProps) {
  const milestones = Array.from(
    new Set(tasks.map((t) => t.milestone).filter((m): m is string => Boolean(m))),
  ).sort();
  const agents = Array.from(
    new Set(tasks.map((t) => t.assignee).filter((a): a is string => Boolean(a))),
  ).sort();

  function toggle<T>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
  }

  return (
    <div
      data-testid="kanban-navigator"
      className="flex h-full min-h-0 w-full flex-col bg-[var(--bg-weak)]"
    >
      <PanelHeader title="Kanban" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-3 text-[12px]">
        <Section icon={<Group aria-hidden="true" size={11} />} title="Group by">
          {(["status", "milestone", "agent", "priority"] as GroupBy[]).map((value) => (
            <NavRow
              key={value}
              testId={`kanban-nav-groupby-${value}`}
              active={groupBy === value}
              onClick={() => onChangeGroupBy(value)}
            >
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </NavRow>
          ))}
        </Section>

        {milestones.length > 0 && (
          <Section icon={<Layers aria-hidden="true" size={11} />} title="Milestone">
            {milestones.map((m) => (
              <NavRow
                key={m}
                testId={`kanban-nav-milestone-${m}`}
                active={filters.milestones.includes(m)}
                onClick={() =>
                  onChangeFilters({ ...filters, milestones: toggle(filters.milestones, m) })
                }
              >
                {m}
              </NavRow>
            ))}
          </Section>
        )}

        {agents.length > 0 && (
          <Section icon={<Filter aria-hidden="true" size={11} />} title="Agent">
            {agents.map((a) => (
              <NavRow
                key={a}
                testId={`kanban-nav-agent-${a}`}
                active={filters.agents.includes(a)}
                onClick={() => onChangeFilters({ ...filters, agents: toggle(filters.agents, a) })}
              >
                @{a}
              </NavRow>
            ))}
          </Section>
        )}

        <Section icon={<Filter aria-hidden="true" size={11} />} title="Priority">
          {[1, 2, 3, 4].map((p) => (
            <NavRow
              key={p}
              testId={`kanban-nav-priority-${p}`}
              active={filters.priorities.includes(p)}
              onClick={() =>
                onChangeFilters({ ...filters, priorities: toggle(filters.priorities, p) })
              }
            >
              {PRIORITY_LABELS[p]}
            </NavRow>
          ))}
        </Section>

        {hasActiveFilters && (
          <button
            type="button"
            data-testid="kanban-nav-clear"
            onClick={onClearFilters}
            className="w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-3 py-1.5 text-[11px] text-[var(--cyan)] outline-none transition-colors hover-only:hover:bg-[var(--surface-hover)] focus-visible:focus-ring"
          >
            Clear all filters
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
        {icon}
        {title}
      </header>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function NavRow({
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
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] outline-none transition-colors duration-150 focus-visible:focus-ring",
        active
          ? "bg-[var(--surface-active)] text-[var(--fg)]"
          : "text-[var(--fg-secondary)] hover-only:hover:bg-[var(--surface-hover)] hover-only:hover:text-[var(--fg)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-[var(--accent)]" : "bg-[var(--surface)]",
        )}
      />
      <span className="truncate">{children}</span>
    </button>
  );
}
