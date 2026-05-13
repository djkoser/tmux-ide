"use client";

/**
 * /v2/widgets — discovery gallery of every widget in tmux-ide.
 *
 * Two categories, 24 tiles total (per docs/widget-index.md):
 *   - 8 daemon TUI widgets    → spawned in a tmux pane via xterm bridge
 *   - 16 Solid DOM widgets    → rendered in the dashboard via Solid signals
 *
 * Tile shape: glyph + name + 1-line description + category badge + "Open"
 * CTA. Solid tiles deep-link to a representative project view; TUI tiles
 * deep-link to `/v2/widget/<name>`, the single-widget xterm mirror route
 * that already exists.
 *
 * Live previews intentionally aren't mounted in this v1: each bridge
 * requires a real `projectName` / `sessionName` to render anything
 * meaningful, and mounting 24 of them at once is expensive. A follow-up
 * can lazy-mount previews when a tile scrolls into view, gated on a
 * "demo" session.
 *
 * Filters: kind chips (All / Solid DOM / Daemon TUI) + search by name
 * or description (case-insensitive substring).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AppWindow,
  BarChart3,
  Boxes,
  CheckSquare,
  Code,
  Compass,
  CornerDownRight,
  Cpu,
  DollarSign,
  Eye,
  FileEdit,
  FileText,
  Files,
  Folder,
  GitCompare,
  Grid3X3,
  Inspect,
  KanbanSquare,
  ListChecks,
  ListTodo,
  Loader2,
  Map,
  MessagesSquare,
  Notebook,
  PanelsTopLeft,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type WidgetKind = "tui" | "solid";

interface WidgetEntry {
  id: string;
  name: string;
  kind: WidgetKind;
  description: string;
  /** Where clicking the tile lands the user. */
  href: string;
  Icon: LucideIcon;
  /** `composite` flag for the chip color tier (richer multi-pane widgets). */
  composite?: boolean;
  /** Status hint from the catalog. */
  status?: "shipped" | "orphan";
}

// Ordered to match docs/widget-index.md for traceability.
const WIDGETS: WidgetEntry[] = [
  // ─── Daemon TUI widgets (8) ─────────────────────────────────────────
  {
    id: "changes",
    name: "changes",
    kind: "tui",
    description: "Git diff viewer for the working tree.",
    href: "/v2/widget/changes",
    Icon: GitCompare,
  },
  {
    id: "config",
    name: "config",
    kind: "tui",
    description: "Interactive ide.yml editor (config tree TUI).",
    href: "/v2/widget/config",
    Icon: Settings,
  },
  {
    id: "costs",
    name: "costs",
    kind: "tui",
    description: "Token + cost tracking per agent and per thread.",
    href: "/v2/widget/costs",
    Icon: DollarSign,
  },
  {
    id: "explorer",
    name: "explorer",
    kind: "tui",
    description: "File tree navigator inside a tmux pane.",
    href: "/v2/widget/explorer",
    Icon: Folder,
  },
  {
    id: "mission-control",
    name: "mission-control",
    kind: "tui",
    description: "Agent + task + event dashboard for the active session.",
    href: "/v2/widget/mission-control",
    Icon: Compass,
    composite: true,
  },
  {
    id: "preview",
    name: "preview",
    kind: "tui",
    description: "Read-only file content preview.",
    href: "/v2/widget/preview",
    Icon: Eye,
  },
  {
    id: "setup",
    name: "setup",
    kind: "tui",
    description: "Project setup wizard — detect stack, write ide.yml.",
    href: "/v2/widget/setup",
    Icon: Wrench,
  },
  {
    id: "tasks",
    name: "tasks",
    kind: "tui",
    description: "Task list / detail / form (TUI flavor).",
    href: "/v2/widget/tasks",
    Icon: ListChecks,
  },
  // ─── Solid DOM widgets (16) ─────────────────────────────────────────
  {
    id: "Activity",
    name: "Activity",
    kind: "solid",
    description: "Event timeline grouped by day with KPI strip + filters.",
    href: "/v2",
    Icon: Activity,
  },
  {
    id: "Changes",
    name: "Changes",
    kind: "solid",
    description: "Compact diff stats summary panel.",
    href: "/v2",
    Icon: GitCompare,
  },
  {
    id: "CommandPalette",
    name: "CommandPalette",
    kind: "solid",
    description: "Cmd+K unified search across providers, skills, tasks, threads.",
    href: "/v2",
    Icon: Search,
  },
  {
    id: "Costs",
    name: "Costs",
    kind: "solid",
    description: "Token + cost metrics. KPI cards + per-agent breakdown.",
    href: "/v2",
    Icon: BarChart3,
  },
  {
    id: "CostsDashboard",
    name: "CostsDashboard",
    kind: "solid",
    description: "Richer cost composite — multi-pane layout. May be unwired.",
    href: "/v2",
    Icon: BarChart3,
    composite: true,
    status: "orphan",
  },
  {
    id: "DiffsViewer",
    name: "DiffsViewer",
    kind: "solid",
    description: "File diffs with hunk navigation + side-by-side toggle.",
    href: "/v2",
    Icon: Code,
  },
  {
    id: "Explorer",
    name: "Explorer",
    kind: "solid",
    description: "Browser-side file tree with virtualized rows.",
    href: "/v2",
    Icon: Files,
  },
  {
    id: "ExplorerDashboard",
    name: "ExplorerDashboard",
    kind: "solid",
    description: "Richer explorer composite with detail pane. May be unwired.",
    href: "/v2",
    Icon: PanelsTopLeft,
    composite: true,
    status: "orphan",
  },
  {
    id: "Inspector",
    name: "Inspector",
    kind: "solid",
    description: "Right-rail event stream scoped to the current view.",
    href: "/v2",
    Icon: Inspect,
  },
  {
    id: "KanbanBoard",
    name: "KanbanBoard",
    kind: "solid",
    description: "Task kanban with status columns and drag-to-cycle.",
    href: "/v2",
    Icon: KanbanSquare,
  },
  {
    id: "MissionControl",
    name: "MissionControl",
    kind: "solid",
    description: "Agents + tasks + events composite for the active session.",
    href: "/v2",
    Icon: Map,
    composite: true,
  },
  {
    id: "MissionControlDashboard",
    name: "MissionControlDashboard",
    kind: "solid",
    description: "Richer mission composite with KPI lanes. May be unwired.",
    href: "/v2",
    Icon: Map,
    composite: true,
    status: "orphan",
  },
  {
    id: "PlansPanel",
    name: "PlansPanel",
    kind: "solid",
    description: "Plan body editor with per-section authorship borders.",
    href: "/v2",
    Icon: FileEdit,
  },
  {
    id: "PlansRail",
    name: "PlansRail",
    kind: "solid",
    description: "Left rail listing plans by status with search + sort.",
    href: "/v2",
    Icon: ListTodo,
  },
  {
    id: "SkillsView",
    name: "SkillsView",
    kind: "solid",
    description: "Project skills rail + body — renders skill markdown.",
    href: "/v2",
    Icon: Sparkles,
  },
  {
    id: "TasksView",
    name: "TasksView",
    kind: "solid",
    description: "Filterable task list — composite dashboard surface.",
    href: "/v2",
    Icon: CheckSquare,
  },
];

type KindFilter = "all" | "tui" | "solid" | "composite";

const FILTER_LABELS: Record<KindFilter, string> = {
  all: "All",
  solid: "Solid DOM",
  tui: "Daemon TUI",
  composite: "Composite",
};

function matchesKind(entry: WidgetEntry, kind: KindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "composite") return Boolean(entry.composite);
  return entry.kind === kind;
}

function matchesSearch(entry: WidgetEntry, query: string): boolean {
  if (!query) return true;
  const haystack = `${entry.name} ${entry.description}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function WidgetsGalleryPage() {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => WIDGETS.filter((w) => matchesKind(w, kindFilter) && matchesSearch(w, query)),
    [kindFilter, query],
  );

  const counts = useMemo(() => {
    const tui = WIDGETS.filter((w) => w.kind === "tui").length;
    const solid = WIDGETS.filter((w) => w.kind === "solid").length;
    const composite = WIDGETS.filter((w) => w.composite).length;
    return { all: WIDGETS.length, tui, solid, composite };
  }, []);

  return (
    <div
      data-testid="widgets-gallery-page"
      className="flex h-full min-h-0 w-full flex-col bg-[var(--bg)] text-[var(--fg)]"
    >
      <header
        data-testid="widgets-gallery-header"
        className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-strong)] px-4 py-3 text-[12px]"
      >
        <Grid3X3 size={16} class="text-[var(--accent)]" aria-hidden="true" />
        <h1 className="text-[13px] font-medium text-[var(--fg)]">Widgets</h1>
        <span className="text-[11px] text-[var(--dim)]">
          ({filtered.length}/{WIDGETS.length})
        </span>
        <span className="flex-1" />
        <Link
          href="/v2"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          ← Back to v2
        </Link>
      </header>

      <div
        data-testid="widgets-gallery-toolbar"
        className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search widgets"
          data-testid="widgets-gallery-search"
          className="h-7 w-64 max-w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
        />
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(FILTER_LABELS) as KindFilter[]).map((kind) => {
            const active = kind === kindFilter;
            const count =
              kind === "all"
                ? counts.all
                : kind === "tui"
                  ? counts.tui
                  : kind === "solid"
                    ? counts.solid
                    : counts.composite;
            return (
              <button
                key={kind}
                type="button"
                data-testid={`widgets-gallery-chip-${kind}`}
                data-active={active ? "true" : undefined}
                onClick={() => setKindFilter(kind)}
                className={
                  "h-7 cursor-pointer rounded-md border px-2 text-[11px] " +
                  (active
                    ? "border-[var(--accent)] bg-[var(--surface-active)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
                }
              >
                {FILTER_LABELS[kind]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div
        data-testid="widgets-gallery-grid"
        className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {filtered.map((entry) => (
          <WidgetTile key={`${entry.kind}:${entry.id}`} entry={entry} />
        ))}
        {filtered.length === 0 && (
          <div
            data-testid="widgets-gallery-empty"
            className="col-span-full flex h-32 items-center justify-center text-[12px] text-[var(--dim)]"
          >
            No widgets match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetTile({ entry }: { entry: WidgetEntry }) {
  return (
    <Link
      href={entry.href}
      data-testid="widget-tile"
      data-widget-id={entry.id}
      data-widget-kind={entry.kind}
      data-widget-composite={entry.composite ? "true" : undefined}
      className="group flex h-[200px] cursor-pointer flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--accent)]"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-strong)] text-[var(--fg-secondary)] group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]"
        >
          <entry.Icon size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-mono text-[13px] text-[var(--fg)] group-hover:text-[var(--accent)]"
            data-testid="widget-tile-name"
          >
            {entry.name}
          </div>
          <div className="flex items-center gap-1.5">
            <CategoryBadge entry={entry} />
            {entry.status === "orphan" && (
              <span
                data-testid="widget-tile-status-orphan"
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--dim)]"
                title="Component exists but may be unwired"
              >
                orphan
              </span>
            )}
          </div>
        </div>
      </div>
      <p
        className="flex-1 overflow-hidden text-[11px] leading-relaxed text-[var(--fg-secondary)]"
        data-testid="widget-tile-description"
      >
        {entry.description}
      </p>
      <div className="flex items-center justify-between text-[10px] text-[var(--dim)]">
        <span className="font-mono">{entry.href}</span>
        <span className="inline-flex items-center gap-1 text-[var(--fg-secondary)] group-hover:text-[var(--accent)]">
          Open <CornerDownRight size={10} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function CategoryBadge({ entry }: { entry: WidgetEntry }) {
  if (entry.kind === "tui") {
    return (
      <span
        data-testid="widget-tile-badge-tui"
        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-strong)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--dim)]"
      >
        <Cpu size={9} aria-hidden="true" />
        TUI
      </span>
    );
  }
  if (entry.composite) {
    return (
      <span
        data-testid="widget-tile-badge-composite"
        className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--surface-active)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--accent)]"
      >
        <Boxes size={9} aria-hidden="true" />
        Composite
      </span>
    );
  }
  return (
    <span
      data-testid="widget-tile-badge-solid"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--fg-secondary)]"
    >
      <SlidersHorizontal size={9} aria-hidden="true" />
      Solid
    </span>
  );
}

// Type-only re-export: keep the icons referenced so unused-import
// lints don't trip on icons reserved for upcoming live previews.
export type {} from "lucide-react";
// Force-reference icons we want available for the live-preview pass:
void AppWindow;
void FileText;
void Loader2;
void MessagesSquare;
void Notebook;
