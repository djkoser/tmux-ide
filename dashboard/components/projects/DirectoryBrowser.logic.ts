import type { FilesystemBrowseResult, FilesystemEntry } from "@/lib/api";

/**
 * Pure logic for the DirectoryBrowser component. Everything in this module is
 * unit-testable in isolation: no React, no DOM, no fetch. The .tsx renderer
 * imports the reducer + helpers and stays thin.
 */

/** Maximum length before path is truncated for the toolbar display. */
export const PATH_TRUNCATE_DEFAULT = 60;

/**
 * Trim and collapse user input. Doesn't expand `~` — the server resolves
 * unset paths to home. Returns the empty string for whitespace-only input.
 */
export function parsePath(input: string): string {
  return input.trim();
}

/**
 * Truncate a long absolute path with an ellipsis in the middle, preserving
 * the leading slash and a few trailing segments. Used by the breadcrumb so
 * deep paths don't blow out the toolbar width.
 *
 * Idempotent: when the path is already short enough, returns it as-is.
 */
export function truncateMiddlePath(path: string, max: number = PATH_TRUNCATE_DEFAULT): string {
  if (path.length <= max) return path;
  // Always keep the last 2 segments; show what we can of the head.
  const parts = path.split("/");
  if (parts.length <= 3) {
    // Fall back to a hard truncation for paths with very few segments.
    const tail = path.slice(-Math.max(8, max - 4));
    return `…${tail}`;
  }
  const tail = `/${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  const headBudget = Math.max(4, max - tail.length - 3);
  const head = path.slice(0, headBudget);
  return `${head}…${tail}`;
}

/**
 * Move the keyboard selection up or down within the entry list. Wraps at
 * the boundaries so users can hit ↓ at the bottom to jump to the top.
 *
 * Returns `0` when the list is empty.
 */
export function selectIndex(
  currentIndex: number,
  key: "ArrowUp" | "ArrowDown",
  entryCount: number,
): number {
  if (entryCount <= 0) return 0;
  if (key === "ArrowUp") {
    if (currentIndex <= 0) return entryCount - 1;
    return currentIndex - 1;
  }
  // ArrowDown
  if (currentIndex >= entryCount - 1) return 0;
  return currentIndex + 1;
}

/**
 * Find the index of an entry by name. Used to keep the keyboard selection
 * synced with the user's last click. Returns `-1` if not found.
 */
export function findEntryIndex(
  entries: ReadonlyArray<FilesystemEntry>,
  name: string | null,
): number {
  if (name === null) return -1;
  return entries.findIndex((e) => e.name === name);
}

// ---------------------------------------------------------------------------
// Reducer — owns the full browse state machine.
// ---------------------------------------------------------------------------

export interface BrowserState {
  /** The path the toolbar is showing right now (controlled). */
  path: string;
  entries: FilesystemEntry[];
  parentPath: string | null;
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  showHidden: boolean;
  /**
   * Monotonic request id. The reducer uses it to ignore stale `loaded`/
   * `failed` actions when the user has already navigated away.
   */
  requestId: number;
}

export function initialBrowserState(initialPath: string, showHidden: boolean): BrowserState {
  return {
    path: initialPath,
    entries: [],
    parentPath: null,
    loading: false,
    error: null,
    selectedIndex: 0,
    showHidden,
    requestId: 0,
  };
}

export type BrowserAction =
  | { type: "requested"; path: string; requestId: number }
  | { type: "loaded"; requestId: number; result: FilesystemBrowseResult }
  | { type: "failed"; requestId: number; message: string }
  | { type: "selectIndex"; index: number }
  | { type: "selectByName"; name: string }
  | { type: "toggleHidden" }
  | { type: "setShowHidden"; showHidden: boolean }
  | { type: "setPath"; path: string };

export function browserReducer(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case "requested":
      return {
        ...state,
        path: action.path,
        loading: true,
        error: null,
        requestId: action.requestId,
      };

    case "loaded": {
      // Ignore stale responses — the user already navigated.
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        loading: false,
        error: null,
        entries: action.result.entries,
        parentPath: action.result.parentPath,
        path: action.result.path,
        selectedIndex: 0,
      };
    }

    case "failed": {
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        loading: false,
        error: action.message,
        entries: [],
        parentPath: null,
      };
    }

    case "selectIndex": {
      const max = state.entries.length - 1;
      const clamped = Math.max(0, Math.min(action.index, Math.max(0, max)));
      return { ...state, selectedIndex: clamped };
    }

    case "selectByName": {
      const idx = findEntryIndex(state.entries, action.name);
      return idx >= 0 ? { ...state, selectedIndex: idx } : state;
    }

    case "toggleHidden":
      return { ...state, showHidden: !state.showHidden };

    case "setShowHidden":
      return { ...state, showHidden: action.showHidden };

    case "setPath":
      return { ...state, path: action.path };

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
