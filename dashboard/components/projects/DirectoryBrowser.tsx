"use client";

import { ArrowLeft, Folder, FolderSymlink, Home, Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { fetchFilesystem, type FilesystemEntry } from "@/lib/api";
import { Button } from "@/components/ui";
import {
  browserReducer,
  initialBrowserState,
  selectIndex,
  truncateMiddlePath,
} from "./DirectoryBrowser.logic";

/**
 * Server-driven directory picker. Replaces the previous plain text input in
 * AddProjectDialog. The dialog (consumer) controls the committed `value`;
 * single-clicks navigate INTO folders, the explicit "Use this folder"
 * button (or ⌘↵) commits via `onSelect`.
 *
 * The component intentionally does no path expansion or sandbox checking —
 * the daemon owns both. Errors come back as readable strings.
 */
export interface DirectoryBrowserProps {
  /** Current committed path. The browser starts listing this. */
  value: string;
  /** Fired whenever the user navigates to a new directory (no commit). */
  onChange: (path: string) => void;
  /** Fired when the user commits ("Use this folder", double-click, ⌘↵). */
  onSelect: (path: string) => void;
  /** Default starting path; jump-to-base button uses this too. */
  baseDir?: string;
  /** Show dotfile entries when true. */
  showHidden?: boolean;
  /** Fired when the toggle flips. */
  onShowHiddenChange?: (next: boolean) => void;
  /** Disables interaction (e.g. during init). */
  disabled?: boolean;
}

export function DirectoryBrowser({
  value,
  onChange,
  onSelect,
  baseDir,
  showHidden,
  onShowHiddenChange,
  disabled,
}: DirectoryBrowserProps) {
  const [state, dispatch] = useReducer(browserReducer, undefined, () =>
    initialBrowserState(value, Boolean(showHidden)),
  );

  const requestIdRef = useRef(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Sync external `showHidden` prop down into state.
  useEffect(() => {
    if (showHidden === undefined) return;
    if (state.showHidden !== showHidden) {
      dispatch({ type: "setShowHidden", showHidden });
    }
  }, [showHidden, state.showHidden]);

  const browse = useCallback(
    (nextPath: string) => {
      if (disabled) return;
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      dispatch({ type: "requested", path: nextPath, requestId });
      onChange(nextPath);
      void (async () => {
        try {
          const result = await fetchFilesystem(nextPath || undefined, state.showHidden);
          dispatch({ type: "loaded", requestId, result });
          onChange(result.path);
        } catch (err) {
          dispatch({
            type: "failed",
            requestId,
            message: err instanceof Error ? err.message : "Browse failed",
          });
        }
      })();
    },
    [disabled, onChange, state.showHidden],
  );

  // Initial load + reload on hidden flag flip.
  useEffect(() => {
    browse(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showHidden]);

  // Keep input value updates in sync.
  useEffect(() => {
    if (value !== state.path) {
      browse(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const navigateTo = useCallback(
    (entry: FilesystemEntry) => {
      if (!entry.isDir) return;
      browse(entry.fullPath);
    },
    [browse],
  );

  const navigateUp = useCallback(() => {
    if (!state.parentPath) return;
    browse(state.parentPath);
  }, [browse, state.parentPath]);

  const commitCurrent = useCallback(() => {
    if (disabled) return;
    onSelect(state.path);
  }, [disabled, onSelect, state.path]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = selectIndex(state.selectedIndex, event.key, state.entries.length);
        dispatch({ type: "selectIndex", index: next });
        return;
      }
      if (event.key === "Enter") {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
          event.preventDefault();
          commitCurrent();
          return;
        }
        const entry = state.entries[state.selectedIndex];
        if (entry && entry.isDir) {
          event.preventDefault();
          navigateTo(entry);
        }
      }
    },
    [commitCurrent, disabled, navigateTo, state.entries, state.selectedIndex],
  );

  // Scroll the selected item into view as the user navigates.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-index="${state.selectedIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [state.selectedIndex]);

  const truncatedPath = truncateMiddlePath(state.path || "", 60);
  const canGoUp = state.parentPath !== null && !disabled && !state.loading;
  const canJumpHome = !disabled;
  const canJumpBase = !disabled && Boolean(baseDir && baseDir.length > 0);

  return (
    <div
      data-testid="directory-browser"
      className="flex min-h-0 flex-1 flex-col rounded-md border border-[var(--border-weak)] bg-[var(--bg)] outline-none"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-weak)] px-2 py-1.5">
        <button
          type="button"
          data-testid="directory-browser-back"
          aria-label="Up one directory"
          disabled={!canGoUp}
          onClick={navigateUp}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--dim)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={13} />
        </button>
        <span
          data-testid="directory-browser-path"
          className="flex-1 truncate font-mono text-[11px] text-[var(--fg)]"
          title={state.path}
        >
          {truncatedPath || "—"}
        </span>
        <button
          type="button"
          data-testid="directory-browser-home"
          aria-label="Home"
          disabled={!canJumpHome}
          onClick={() => browse("")}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--dim)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Home size={13} />
        </button>
        <button
          type="button"
          data-testid="directory-browser-base"
          aria-label="Base directory"
          disabled={!canJumpBase}
          onClick={() => baseDir && browse(baseDir)}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--dim)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MapPin size={13} />
        </button>
        <label className="flex items-center gap-1 text-[11px] text-[var(--dim)]">
          <input
            type="checkbox"
            data-testid="directory-browser-hidden-toggle"
            checked={state.showHidden}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.checked;
              dispatch({ type: "setShowHidden", showHidden: next });
              onShowHiddenChange?.(next);
            }}
            className="h-3 w-3"
          />
          <span>hidden</span>
        </label>
      </div>

      {/* Entry list — flex-grows inside the parent so it scrolls internally
          regardless of the surrounding panel height. */}
      <ul
        ref={listRef}
        data-testid="directory-browser-list"
        className="min-h-[180px] flex-1 overflow-auto py-1"
        role="listbox"
        aria-label="Directory entries"
      >
        {state.loading && state.entries.length === 0 && (
          <li className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--dim)]">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </li>
        )}
        {state.error && !state.loading && (
          <li
            data-testid="directory-browser-error"
            className="px-3 py-2 text-[11px] text-[var(--red)]"
          >
            {state.error}
          </li>
        )}
        {!state.loading && !state.error && state.entries.length === 0 && (
          <li className="px-3 py-2 text-[11px] text-[var(--dim)]">Empty directory</li>
        )}
        {state.entries.map((entry, index) => {
          const selected = index === state.selectedIndex;
          const Icon = entry.isSymlink ? FolderSymlink : Folder;
          return (
            <li
              key={entry.fullPath}
              data-index={index}
              data-testid={`directory-browser-entry-${entry.name}`}
              role="option"
              aria-selected={selected}
              data-selected={selected ? "true" : "false"}
              data-isdir={entry.isDir ? "true" : "false"}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1 text-[11px] transition-colors ${
                selected
                  ? "bg-[var(--surface)] text-[var(--fg)]"
                  : "text-[var(--fg)] hover:bg-[var(--surface)]"
              } ${entry.isDir ? "" : "opacity-60"}`}
              onClick={() => {
                dispatch({ type: "selectIndex", index });
                if (entry.isDir) navigateTo(entry);
              }}
              onDoubleClick={() => {
                if (entry.isDir) navigateTo(entry);
              }}
            >
              {entry.isDir ? (
                <Icon size={12} className="text-[var(--accent)]" />
              ) : (
                <span className="inline-block h-3 w-3" aria-hidden="true" />
              )}
              <span className="truncate">{entry.name}</span>
            </li>
          );
        })}
      </ul>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-weak)] px-2 py-1.5">
        <span className="truncate font-mono text-[11px] text-[var(--dim)]">
          Selected: <span className="text-[var(--fg)]">{state.path || "—"}</span>
        </span>
        <Button
          data-testid="directory-browser-select"
          onClick={commitCurrent}
          disabled={disabled || state.loading || state.path.length === 0}
          variant="default"
          size="sm"
        >
          Use this folder
        </Button>
      </div>
    </div>
  );
}
