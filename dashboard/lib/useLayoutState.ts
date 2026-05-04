"use client";

import { useSyncExternalStore } from "react";
import { Persist } from "./persist";

export interface TerminalTab {
  id: string;
  title: string;
  projectName: string;
  cwd?: string;
  cmd?: string[];
}

export interface TerminalTabOptions {
  title?: string;
  cwd?: string;
  cmd?: string[];
}

/**
 * @deprecated Workspace tabs moved into NavigationState as part of
 * Phase Z. This kind union remains so legacy call sites in
 * `sessions/SessionsNavigator.tsx`, `skills/SkillsNavigator.tsx`, and
 * `KeybindRoot.tsx` keep compiling — the shims below route through the
 * new navigation tab store when given a project workspace tab.
 */
export type WorkspaceTabKind = "project" | "settings" | "notifications" | "skill";

/**
 * @deprecated Surface preserved for legacy navigators that still call
 * `openWorkspaceTab(...)`. New code should construct `Tab` values via
 * `viewTab/skillTab/settingsTab` and call `openTab(...)` from
 * `@/lib/navigation`.
 */
export interface WorkspaceTab {
  id: string;
  kind: WorkspaceTabKind;
  projectName: string | null;
  title: string;
  ref?: string;
}

/**
 * @deprecated Activity section is no longer part of layout state; modes
 * (sessions/skills/settings) are derived from the active tab kind in
 * NavigationState. Keep the type alias so legacy imports still compile.
 */
export type ActivitySection = "sessions" | "settings" | "skills";

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
  setActiveTab(projectName: string, id: string): void;
  newTab(projectName: string, options?: string | TerminalTabOptions): TerminalTab;
  closeTab(id: string): void;
  reorderTabs(orderedIds: string[]): void;
  /**
   * @deprecated Use `openTab(...)` from `@/lib/navigation` instead. This
   * shim routes project/settings/skill tabs through the new navigation
   * store so legacy call sites keep working.
   */
  openWorkspaceTab(
    kind: WorkspaceTabKind,
    projectName: string | null,
    title?: string,
    ref?: string,
  ): WorkspaceTab;
  /** @deprecated No-op shim. */
  closeWorkspaceTab(id: string): void;
  /** @deprecated No-op shim. */
  setActiveWorkspaceTab(id: string): void;
  /** @deprecated No-op shim. */
  reorderWorkspaceTabs(orderedIds: string[]): void;
  /** @deprecated No-op shim. */
  setActivitySection(section: ActivitySection): void;
}

type PersistedLayoutState = Pick<LayoutState, "activeTabIdByProject" | "tabs">;
type LayoutStore = LayoutState &
  LayoutActions &
  LayoutQueries & {
    /** @deprecated Always empty — workspace tabs migrated to NavigationState. */
    readonly workspaceTabs: WorkspaceTab[];
    /** @deprecated Always null — workspace tabs migrated to NavigationState. */
    readonly activeWorkspaceTabId: string | null;
    /** @deprecated Always "sessions" — modes derived from NavigationState. */
    readonly activitySection: ActivitySection;
  };

const defaults: PersistedLayoutState = {
  activeTabIdByProject: {},
  tabs: [],
};

const persist = Persist.global<PersistedLayoutState>(
  "tmux-ide.layout",
  ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"],
  defaults,
  {
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
    v3: (prev: unknown) => (isRecord(prev) ? prev : defaults),
    v4: (prev: unknown) => (isRecord(prev) ? prev : defaults),
    v5: (prev: unknown) => (isRecord(prev) ? prev : defaults),
    v6: (prev: unknown) => (isRecord(prev) ? prev : defaults),
    v7: (prev: unknown) => (isRecord(prev) ? prev : defaults),
    // v8: dropped workspaceTabs / activeWorkspaceTabId / activitySection
    // (migrated into NavigationState in Phase Z). Existing terminal-tab
    // state passes through untouched.
    v8: (prev: unknown) => (isRecord(prev) ? prev : defaults),
  },
);
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersisted(value: unknown): PersistedLayoutState {
  if (!isRecord(value)) return defaults;

  const seenTerminalTabs = new Set<string>();
  const projectsSeen = new Set<string>();
  const rawTabs = Array.isArray(value.tabs) ? value.tabs : [];
  const tabs = rawTabs.flatMap((tab) => {
    if (
      !isRecord(tab) ||
      typeof tab["id"] !== "string" ||
      typeof tab["title"] !== "string" ||
      typeof tab["projectName"] !== "string" ||
      seenTerminalTabs.has(tab["id"])
    ) {
      return [];
    }
    seenTerminalTabs.add(tab["id"]);
    projectsSeen.add(tab["projectName"]);
    return [
      {
        id: tab["id"],
        title: tab["title"],
        projectName: tab["projectName"],
        ...(typeof tab["cwd"] === "string" ? { cwd: tab["cwd"] } : {}),
        ...(Array.isArray(tab["cmd"]) && tab["cmd"].every((part) => typeof part === "string")
          ? { cmd: tab["cmd"] }
          : {}),
      },
    ];
  });

  const activeRaw = isRecord(value.activeTabIdByProject) ? value.activeTabIdByProject : {};
  const activeTabIdByProject: Record<string, string | null> = {};
  for (const [project, id] of Object.entries(activeRaw)) {
    if (typeof id === "string" && seenTerminalTabs.has(id) && projectsSeen.has(project)) {
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

function normalizeTabOptions(options?: string | TerminalTabOptions): TerminalTabOptions {
  if (typeof options === "string") return { title: options };
  if (!options) return {};
  return {
    ...(typeof options.title === "string" ? { title: options.title } : {}),
    ...(typeof options.cwd === "string" ? { cwd: options.cwd } : {}),
    ...(Array.isArray(options.cmd) &&
    options.cmd.length > 0 &&
    options.cmd.every((part) => typeof part === "string")
      ? { cmd: options.cmd }
      : {}),
  };
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
  newTab(projectName: string, options?: string | TerminalTabOptions) {
    const seq = nextSeq(projectName, state.tabs);
    const tabOptions = normalizeTabOptions(options);
    const tab = {
      id: `${projectName}:${seq}`,
      title: tabOptions.title || `${projectName} ${seq}`,
      projectName,
      ...(tabOptions.cwd ? { cwd: tabOptions.cwd } : {}),
      ...(tabOptions.cmd ? { cmd: tabOptions.cmd } : {}),
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
  // ----- Deprecated workspace-tab compat shims -----
  openWorkspaceTab(
    kind: WorkspaceTabKind,
    projectName: string | null,
    title?: string,
    ref?: string,
  ) {
    void kind;
    void title;
    void ref;
    // Route through the new navigation store so legacy call sites still
    // open the right tab. Lazy-imported to avoid a circular module load.
    if (typeof window !== "undefined") {
      void import("./navigation").then((nav) => {
        if (kind === "project" && projectName) {
          nav.setActiveSession(projectName);
        } else if (kind === "settings") {
          nav.openTab(nav.settingsTab());
        } else if (kind === "skill" && projectName && ref) {
          nav.openTab(nav.skillTab(projectName, ref, title));
        }
      });
    }
    return {
      id: `${kind}:${projectName ?? ""}${ref ? `:${ref}` : ""}`,
      kind,
      projectName,
      title:
        title ??
        (kind === "settings" ? "Settings" : kind === "skill" && ref ? `Skill · ${ref}` : "Tab"),
      ...(ref ? { ref } : {}),
    };
  },
  closeWorkspaceTab(_id: string) {
    // No-op: workspace tabs moved into NavigationState.
  },
  setActiveWorkspaceTab(_id: string) {
    // No-op: workspace tabs moved into NavigationState.
  },
  reorderWorkspaceTabs(_orderedIds: string[]) {
    // No-op: workspace tabs moved into NavigationState.
  },
  setActivitySection(_section: ActivitySection) {
    // No-op: activity section concept retired; modes derive from
    // NavigationState's active tab kind.
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LayoutState {
  return state;
}

const serverSnapshot: LayoutState = {
  terminalOpen: false,
  activeTabIdByProject: {},
  tabs: [],
};

function getServerSnapshot(): LayoutState {
  return serverSnapshot;
}

function queriesForSnapshot(snapshot: LayoutState): LayoutQueries {
  return {
    getProjectTabs(projectName: string) {
      return projectTabs(snapshot.tabs, projectName);
    },
    getActiveTabId(projectName: string) {
      const explicit = snapshot.activeTabIdByProject[projectName];
      if (
        explicit &&
        snapshot.tabs.some((t) => t.id === explicit && t.projectName === projectName)
      ) {
        return explicit;
      }
      return fallbackActive(snapshot.tabs, projectName);
    },
  };
}

export function getProjectTabsLive(projectName: string): TerminalTab[] {
  return projectTabs(state.tabs, projectName);
}

export function getActiveTabIdLive(projectName: string): string | null {
  const explicit = state.activeTabIdByProject[projectName];
  if (explicit && state.tabs.some((t) => t.id === explicit && t.projectName === projectName)) {
    return explicit;
  }
  return fallbackActive(state.tabs, projectName);
}

export function useLayoutState(): LayoutStore {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...snapshot,
    ...actions,
    ...queriesForSnapshot(snapshot),
    workspaceTabs: [],
    activeWorkspaceTabId: null,
    activitySection: "sessions",
  };
}

export function __resetLayoutStateForTests(next?: Partial<LayoutState>): void {
  state = {
    ...initialState(),
    ...next,
  };
  emit();
}
