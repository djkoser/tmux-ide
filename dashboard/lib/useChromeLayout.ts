"use client";

/**
 * useChromeLayout — VSCode-style IDE chrome state.
 *
 * Tracks which of the three secondary regions are visible:
 *   - Left sidebar      (Primary Sidebar — ProjectSidebar)
 *   - Right inspector   (Secondary Sidebar — InspectorBridge)
 *   - Bottom panel      (Panel — BottomPanel: Terminal/Problems/Output)
 *
 * Each region is independently togglable. State persists to
 * localStorage so refreshing the page or hot-reloading dev mode
 * preserves the user's chrome layout.
 *
 * Read via the `useChromeLayout()` hook (useSyncExternalStore — matches
 * the existing useLayoutState shim's pattern). Mutate via the three
 * imperative actions. The actions are also exported as named functions
 * so the keybind handler in `useChromeShortcuts` can fire them without
 * pulling in a hook subscription.
 *
 * Keybinds (`Cmd`/`Ctrl` based on platform):
 *   - Cmd+B       toggleLeftSidebar
 *   - Cmd+Alt+B   toggleRightInspector
 *   - Cmd+J       toggleBottomPanel
 *
 * These match VSCode's defaults exactly so users coming from VSCode
 * keep their muscle memory.
 */

import { useSyncExternalStore } from "react";

export interface ChromeLayoutState {
  leftSidebarOpen: boolean;
  rightInspectorOpen: boolean;
  bottomPanelOpen: boolean;
}

const STORAGE_KEY = "tmux-ide.v2.chrome.v1";

const DEFAULT_STATE: ChromeLayoutState = {
  leftSidebarOpen: true,
  rightInspectorOpen: true,
  bottomPanelOpen: true,
};

let state: ChromeLayoutState = DEFAULT_STATE;
const listeners = new Set<() => void>();
let hydrated = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function readPersisted(): ChromeLayoutState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChromeLayoutState>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      leftSidebarOpen:
        typeof parsed.leftSidebarOpen === "boolean"
          ? parsed.leftSidebarOpen
          : DEFAULT_STATE.leftSidebarOpen,
      rightInspectorOpen:
        typeof parsed.rightInspectorOpen === "boolean"
          ? parsed.rightInspectorOpen
          : DEFAULT_STATE.rightInspectorOpen,
      bottomPanelOpen:
        typeof parsed.bottomPanelOpen === "boolean"
          ? parsed.bottomPanelOpen
          : DEFAULT_STATE.bottomPanelOpen,
    };
  } catch {
    return null;
  }
}

function persist(next: ChromeLayoutState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / disabled — fall through silently */
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const persisted = readPersisted();
  if (persisted) {
    state = persisted;
    emit();
  }
}

function update(patch: Partial<ChromeLayoutState>): void {
  const next: ChromeLayoutState = { ...state, ...patch };
  if (
    next.leftSidebarOpen === state.leftSidebarOpen &&
    next.rightInspectorOpen === state.rightInspectorOpen &&
    next.bottomPanelOpen === state.bottomPanelOpen
  ) {
    return;
  }
  state = next;
  persist(next);
  emit();
}

export function toggleLeftSidebar(): void {
  update({ leftSidebarOpen: !state.leftSidebarOpen });
}

export function toggleRightInspector(): void {
  update({ rightInspectorOpen: !state.rightInspectorOpen });
}

export function toggleBottomPanel(): void {
  update({ bottomPanelOpen: !state.bottomPanelOpen });
}

export function setLeftSidebarOpen(next: boolean): void {
  update({ leftSidebarOpen: next });
}

export function setRightInspectorOpen(next: boolean): void {
  update({ rightInspectorOpen: next });
}

export function setBottomPanelOpen(next: boolean): void {
  update({ bottomPanelOpen: next });
}

export function getChromeLayoutSnapshot(): ChromeLayoutState {
  return state;
}

function subscribe(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ChromeLayoutState {
  hydrate();
  return state;
}

function getServerSnapshot(): ChromeLayoutState {
  return DEFAULT_STATE;
}

export function useChromeLayout(): ChromeLayoutState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test-only: clear listeners + reset to defaults. */
export function __resetChromeLayoutForTests(): void {
  state = { ...DEFAULT_STATE };
  hydrated = false;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
