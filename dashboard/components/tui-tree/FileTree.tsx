"use client";

/**
 * FileTree — recursive, gitignore-aware file tree built on the SACRED
 * `@components/TreeView` primitive. Pure-render — no fetching here. Caller
 * supplies a tree of `FileTreeEntry` nodes; this component handles tree-art,
 * expand/collapse, and selection.
 *
 * Reference data shape: mirrors `src/widgets/explorer/tree-model.ts` (the
 * Solid/OpenTUI explorer widget) with the Node-only fields stripped — no
 * `absolutePath`, since the dashboard side never reads files directly.
 *
 * TreeView clones its direct React children to inject
 * `depth` / `isLastChild` / `parentLines` props. Each `FileTreeNode` accepts
 * those injected props and forwards them to the inner `TreeView`, so the
 * tree-art lines compute correctly through any depth.
 *
 * Selection is delegated at the FileTree root:
 *   - each node renders a `<div data-tree-row-path={...}>` wrapper around
 *     its TreeView,
 *   - a single `onClick` handler at the FileTree root resolves the clicked
 *     row via `closest('[role="button"]')` then `closest('[data-tree-row-path]')`,
 *   - the resolved `path` is dispatched to the caller via `onSelect`.
 *
 * Selection is also expressed visually by prefixing the title with a small
 * marker glyph when `selectedPath === entry.path` (terminal-aesthetic; avoids
 * having to reach into TreeView's CSS module).
 */

import { useCallback, useMemo, type MouseEvent } from "react";
import TreeView from "@components/TreeView";

export interface FileTreeEntry {
  /** Display name (the path's last segment). */
  name: string;
  /** Path relative to the project root — used as the unique key. */
  path: string;
  /** True for directories, false for regular files. */
  isDir: boolean;
  /** True when matched by `.gitignore`. Optional; treated as `false` when omitted. */
  ignored?: boolean;
  /**
   * Loaded children. `undefined` means "not yet expanded / not yet loaded";
   * an empty array means "expanded, confirmed empty". Only meaningful when
   * `isDir` is true.
   */
  children?: FileTreeEntry[];
}

export interface FileTreeProps {
  /** Root-level entries; each one becomes a top-level node in the tree. */
  rootEntries: ReadonlyArray<FileTreeEntry>;
  /**
   * Currently-selected path. The matching node renders with a marker glyph;
   * pass `null` to render no selection highlight.
   */
  selectedPath?: string | null;
  /**
   * Fired when the user clicks a row (file or directory). The directory's
   * own expand/collapse toggle still fires through TreeView itself — this
   * callback is independent.
   */
  onSelect?: (path: string, entry: FileTreeEntry) => void;
  /**
   * When `true` (default), entries with `ignored: true` are hidden from the
   * tree. When `false`, they render with reduced opacity instead.
   */
  gitignoreFilter?: boolean;
  /** Open all directories on first render. Defaults to `false`. */
  defaultExpanded?: boolean;
}

const SELECTION_MARKER = "▸ ";

export function FileTree({
  rootEntries,
  selectedPath = null,
  onSelect,
  gitignoreFilter = true,
  defaultExpanded = false,
}: FileTreeProps) {
  const visibleRoots = useMemo(
    () => filterEntries(rootEntries, gitignoreFilter),
    [rootEntries, gitignoreFilter],
  );

  // Single delegated handler. Walks from the clicked element to the row, then
  // to the nearest enclosing data-tree-row-path wrapper, and dispatches the
  // path. Avoids per-row React listeners and keeps TreeView's child-cloning
  // path uncluttered.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!onSelect) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const row = target.closest('[role="button"]');
      if (!row) return;
      const owner = row.closest("[data-tree-row-path]");
      if (!owner) return;
      const path = owner.getAttribute("data-tree-row-path");
      if (!path) return;
      const entry = findEntry(rootEntries, path);
      if (!entry) return;
      onSelect(path, entry);
    },
    [onSelect, rootEntries],
  );

  return (
    <div role="tree" data-testid="file-tree" onClick={handleClick}>
      {visibleRoots.map((entry, index) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          isLastChild={index === visibleRoots.length - 1}
          gitignoreFilter={gitignoreFilter}
          defaultExpanded={defaultExpanded}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  entry: FileTreeEntry;
  gitignoreFilter: boolean;
  defaultExpanded: boolean;
  selectedPath: string | null;

  // Injected by TreeView's cloneElement (or seeded by FileTree for the top
  // level). Forwarded to the inner TreeView so the tree-art draws correctly.
  isLastChild?: boolean;
  depth?: number;
  parentLines?: boolean[];
}

function FileTreeNode({
  entry,
  gitignoreFilter,
  defaultExpanded,
  selectedPath,
  isLastChild,
  depth,
  parentLines,
}: FileTreeNodeProps) {
  const isSelected = selectedPath !== null && selectedPath === entry.path;

  // Children list: only meaningful for directories. When a directory has no
  // children prop yet (`undefined`), we render an empty TreeView body — this
  // matches the lazy-load pattern of the OpenTUI explorer widget.
  const visibleChildren = useMemo(() => {
    if (!entry.isDir) return [];
    return filterEntries(entry.children ?? [], gitignoreFilter);
  }, [entry.children, entry.isDir, gitignoreFilter]);

  const titleText = isSelected ? `${SELECTION_MARKER}${entry.name}` : entry.name;

  // Style hint for ignored entries when the filter is OFF: dim the row.
  // When the filter is ON they're already excluded by `filterEntries`.
  const ignoredDim = entry.ignored && !gitignoreFilter ? { opacity: 0.6 } : undefined;

  return (
    <div
      data-tree-row-path={entry.path}
      data-selected={isSelected ? "true" : "false"}
      data-ignored={entry.ignored ? "true" : "false"}
      data-is-dir={entry.isDir ? "true" : "false"}
      style={ignoredDim}
    >
      <TreeView
        title={titleText}
        isFile={!entry.isDir}
        isLastChild={isLastChild}
        depth={depth}
        parentLines={parentLines}
        defaultValue={entry.isDir && defaultExpanded}
      >
        {entry.isDir
          ? visibleChildren.map((child, index) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                isLastChild={index === visibleChildren.length - 1}
                gitignoreFilter={gitignoreFilter}
                defaultExpanded={defaultExpanded}
                selectedPath={selectedPath}
              />
            ))
          : null}
      </TreeView>
    </div>
  );
}

function filterEntries(
  entries: ReadonlyArray<FileTreeEntry>,
  gitignoreFilter: boolean,
): FileTreeEntry[] {
  if (!gitignoreFilter) return [...entries];
  return entries.filter((entry) => !entry.ignored);
}

function findEntry(entries: ReadonlyArray<FileTreeEntry>, path: string): FileTreeEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    if (entry.isDir && entry.children) {
      const found = findEntry(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}

export default FileTree;
