"use client";

import { useSyncExternalStore } from "react";
import { Persist } from "./persist";

export interface TerminalTab {
  id: string;
  title: string;
  projectName: string;
}

export interface LayoutState {
  terminalOpen: boolean;
  /**
   * Active tab id per project. Each project keeps its own active tab so
   * switching projects in the sidebar restores the right terminal in the
   * full-screen mode. A missing entry means "use the first tab in this
   * project's tab list" (resolved by getActiveTabId).
   */
  activeTabIdByProject: Record<string, string | null>;
  tabs: TerminalTab[];
}

export interface LayoutQueries {
  /** Tabs filtered to a single project, in current order. */
  getProjectTabs(projectName: string): TerminalTab[];
  /** Active tab id for a project, falling back to the first tab in that project. */
  getActiveTabId(projectName: string): string | null;
}

export interface LayoutActions {
  toggleTerminal(): void;
  openTerminalMode(): void;
  closeTerminalMode(): void;
  /** Active state is scoped per-project so each project remembers its own focused tab. */
  setActiveTab(projectName: string, id: string): void;
  newTab(projectName: string, title?: string): TerminalTab;
  closeTab(id: string): void;
  reorderTabs(orderedIds: string[]): void;
}

type PersistedLayoutState = Pick<LayoutState, "activeTabIdByProject" | "tabs">;
type LayoutStore = LayoutState & LayoutActions & LayoutQueries;

const defaults: PersistedLayoutState = {
  activeTabIdByProject: {},
  tabs: [],
};

const persist = Persist.global<PersistedLayoutState>("tmux-ide.layout", ["v1", "v2"], defaults, {
  // Migrating INTO v2: legacy `activeTabId` (single global) → `activeTabIdByProject` map.
  v2: (prev: unknown) => {
    if (!isRecord(prev)) return defaults;
    const tabs = Array.isArray(prev.tabs) ? prev.tabs : [];
    const legacyActive = typeof prev.activeTabId === "string" ? prev.activeTabId : null;
    const activeTabIdByProject: Record<string, string | null> = {};
    if (legacyActive) {
      const tab = tabs.find(
        (t): t is { id: string; projectName: string } =>
          isRecord(t) &&
          typeof t["id"] === "string" &&
          t["id"] === legacyActive &&
          typeof t["projectName"] === "string",
      );
      if (tab) activeTabIdByProject[tab.projectName] = legacyActive;
    }
    return { tabs, activeTabIdByProject };
  },
});
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersisted(value: unknown): PersistedLayoutState {
  if (!isRecord(value)) return defaults;

  const seen = new Set<string>();
  const projectsSeen = new Set<string>();
  const rawTabs = Array.isArray(value.tabs) ? value.tabs : [];
  const tabs = rawTabs.flatMap((tab) => {
    if (
      !isRecord(tab) ||
      typeof tab["id"] !== "string" ||
      typeof tab["title"] !== "string" ||
      typeof tab["projectName"] !== "string" ||
      seen.has(tab["id"])
    ) {
      return [];
    }
    seen.add(tab["id"]);
    projectsSeen.add(tab["projectName"]);
    return [{ id: tab["id"], title: tab["title"], projectName: tab["projectName"] }];
  });

  const activeRaw = isRecord(value.activeTabIdByProject) ? value.activeTabIdByProject : {};
  const activeTabIdByProject: Record<string, string | null> = {};
  for (const [project, id] of Object.entries(activeRaw)) {
    if (typeof id === "string" && seen.has(id) && projectsSeen.has(project)) {
      activeTabIdByProject[project] = id;
    }
  }

  return { tabs, activeTabIdByProject };
}

function initialState(): LayoutState {
  const persisted = normalizePersisted(persist.read());
  return {
    terminalOpen: false,
    activeTabIdByProject: persisted.activeTabIdByProject,
    tabs: persisted.tabs,
  };
}

let state = initialState();

function persistState(next: LayoutState): void {
  persist.write({
    activeTabIdByProject: next.activeTabIdByProject,
    tabs: next.tabs,
  });
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(
  recipe: LayoutState | ((current: LayoutState) => LayoutState),
  options: { persist?: boolean } = {},
): void {
  state = typeof recipe === "function" ? recipe(state) : recipe;
  if (options.persist ?? true) persistState(state);
  emit();
}

function nextSeq(projectName: string, tabs: TerminalTab[]): number {
  let max = 0;
  const prefix = `${projectName}:`;
  for (const tab of tabs) {
    if (!tab.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(tab.id.slice(prefix.length), 10);
    if (Number.isFinite(seq)) max = Math.max(max, seq);
  }
  return max + 1;
}

function projectTabs(tabs: TerminalTab[], projectName: string): TerminalTab[] {
  return tabs.filter((tab) => tab.projectName === projectName);
}

function fallbackActive(tabs: TerminalTab[], projectName: string): string | null {
  const first = projectTabs(tabs, projectName)[0];
  return first ? first.id : null;
}

const actions: LayoutActions = {
  toggleTerminal() {
    setState((current) => ({ ...current, terminalOpen: !current.terminalOpen }), {
      persist: false,
    });
  },
  openTerminalMode() {
    setState((current) => ({ ...current, terminalOpen: true }), { persist: false });
  },
  closeTerminalMode() {
    setState((current) => ({ ...current, terminalOpen: false }), { persist: false });
  },
  setActiveTab(projectName: string, id: string) {
    setState((current) => {
      const tab = current.tabs.find((t) => t.id === id);
      if (!tab || tab.projectName !== projectName) return current;
      return {
        ...current,
        terminalOpen: true,
        activeTabIdByProject: { ...current.activeTabIdByProject, [projectName]: id },
      };
    });
  },
  newTab(projectName: string, title?: string) {
    const seq = nextSeq(projectName, state.tabs);
    const tab = {
      id: `${projectName}:${seq}`,
      title: title || `${projectName} ${seq}`,
      projectName,
    };
    setState((current) => ({
      ...current,
      terminalOpen: true,
      activeTabIdByProject: { ...current.activeTabIdByProject, [projectName]: tab.id },
      tabs: [...current.tabs, tab],
    }));
    return tab;
  },
  closeTab(id: string) {
    setState((current) => {
      const closing = current.tabs.find((tab) => tab.id === id);
      if (!closing) return current;

      const tabs = current.tabs.filter((tab) => tab.id !== id);
      const activeTabIdByProject = { ...current.activeTabIdByProject };
      if (activeTabIdByProject[closing.projectName] === id) {
        const fallback = fallbackActive(tabs, closing.projectName);
        if (fallback) activeTabIdByProject[closing.projectName] = fallback;
        else delete activeTabIdByProject[closing.projectName];
      }

      return {
        ...current,
        terminalOpen: tabs.length > 0 ? current.terminalOpen : false,
        activeTabIdByProject,
        tabs,
      };
    });
  },
  reorderTabs(orderedIds: string[]) {
    setState((current) => {
      const byId = new Map(current.tabs.map((tab) => [tab.id, tab]));
      const ordered = orderedIds.flatMap((id) => {
        const tab = byId.get(id);
        if (!tab) return [];
        byId.delete(id);
        return [tab];
      });
      return {
        ...current,
        tabs: [...ordered, ...byId.values()],
      };
    });
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LayoutState {
  return state;
}

const queries: LayoutQueries = {
  getProjectTabs(projectName: string) {
    return projectTabs(state.tabs, projectName);
  },
  getActiveTabId(projectName: string) {
    const explicit = state.activeTabIdByProject[projectName];
    if (explicit && state.tabs.some((t) => t.id === explicit && t.projectName === projectName)) {
      return explicit;
    }
    return fallbackActive(state.tabs, projectName);
  },
};

export function useLayoutState(): LayoutStore {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snapshot, ...actions, ...queries };
}

export function __resetLayoutStateForTests(next?: Partial<LayoutState>): void {
  state = {
    ...initialState(),
    ...next,
  };
  emit();
}
