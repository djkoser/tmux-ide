"use client";

import { useCallback, useEffect, useState } from "react";
import { Persist } from "@/lib/persist";
import { EMPTY_FILTERS, type Density, type GroupBy, type KanbanFilters } from "./kanban-types";

interface PersistedKanbanState {
  filters: KanbanFilters;
  groupBy: GroupBy;
  density: Density;
}

const DEFAULTS: PersistedKanbanState = {
  filters: EMPTY_FILTERS,
  groupBy: "status",
  density: "comfortable",
};

const persist = Persist.global<PersistedKanbanState>("tmux-ide.kanban", ["v1"], DEFAULTS);

function normalize(value: unknown): PersistedKanbanState {
  if (!value || typeof value !== "object") return DEFAULTS;
  const v = value as Partial<PersistedKanbanState>;
  const filters = v.filters && typeof v.filters === "object" ? v.filters : EMPTY_FILTERS;
  return {
    filters: {
      milestones: Array.isArray(filters.milestones) ? filters.milestones.filter((x): x is string => typeof x === "string") : [],
      agents: Array.isArray(filters.agents) ? filters.agents.filter((x): x is string => typeof x === "string") : [],
      priorities: Array.isArray(filters.priorities) ? filters.priorities.filter((x): x is number => typeof x === "number") : [],
      search: typeof filters.search === "string" ? filters.search : "",
    },
    groupBy:
      v.groupBy === "status" ||
      v.groupBy === "milestone" ||
      v.groupBy === "agent" ||
      v.groupBy === "priority"
        ? v.groupBy
        : "status",
    density: v.density === "compact" || v.density === "comfortable" ? v.density : "comfortable",
  };
}

export interface KanbanStateHook {
  filters: KanbanFilters;
  setFilters(next: KanbanFilters | ((prev: KanbanFilters) => KanbanFilters)): void;
  groupBy: GroupBy;
  setGroupBy(next: GroupBy): void;
  density: Density;
  setDensity(next: Density): void;
  clearFilters(): void;
  hasActiveFilters: boolean;
}

export function useKanbanState(): KanbanStateHook {
  const [state, setState] = useState<PersistedKanbanState>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    setState(normalize(persist.read()));
    setHydrated(true);
  }, []);

  // Persist on change (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    persist.write(state);
  }, [state, hydrated]);

  const setFilters = useCallback(
    (next: KanbanFilters | ((prev: KanbanFilters) => KanbanFilters)) => {
      setState((prev) => ({
        ...prev,
        filters: typeof next === "function" ? next(prev.filters) : next,
      }));
    },
    [],
  );

  const setGroupBy = useCallback((groupBy: GroupBy) => {
    setState((prev) => ({ ...prev, groupBy }));
  }, []);

  const setDensity = useCallback((density: Density) => {
    setState((prev) => ({ ...prev, density }));
  }, []);

  const clearFilters = useCallback(() => {
    setState((prev) => ({ ...prev, filters: EMPTY_FILTERS }));
  }, []);

  const f = state.filters;
  const hasActiveFilters =
    f.milestones.length > 0 ||
    f.agents.length > 0 ||
    f.priorities.length > 0 ||
    f.search.trim().length > 0;

  return {
    filters: state.filters,
    setFilters,
    groupBy: state.groupBy,
    setGroupBy,
    density: state.density,
    setDensity,
    clearFilters,
    hasActiveFilters,
  };
}
