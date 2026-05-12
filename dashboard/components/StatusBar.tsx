"use client";

/**
 * StatusBar — bottom status footer of the VSCode-style IDE shell at
 * /v2/project/[name]. 24px tall, --bg-strong background, --fg-muted text.
 *
 * Surfaces project-wide signals at a glance:
 *   - Current git branch (fetched from /api/project/:name on mount + focus)
 *   - Workspace session name (with run/stop dot)
 *   - Agent count
 *   - Latest event timestamp (relative)
 *
 * Click branch → opens the command palette (future-hook for a branch
 * switcher action). Click theme icon → ThemeToggle. No other surfaces
 * live here — the spec deliberately keeps it slim.
 */

import { useEffect, useState } from "react";
import {
  GitBranch,
  PanelLeft,
  PanelBottom,
  PanelRight,
  type LucideIcon,
} from "lucide-react";
import { openCommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { EventData } from "@/lib/api";
import {
  toggleBottomPanel,
  toggleLeftSidebar,
  toggleRightInspector,
  useChromeLayout,
} from "@/lib/useChromeLayout";

interface StatusBarProps {
  projectName: string;
  running: boolean;
  agentCount: number;
  events: ReadonlyArray<EventData>;
  /**
   * Optional unread badge count for the Bottom Panel toggle — when the
   * bottom panel is hidden and new problems land, the host can surface
   * the count here to draw attention. 0 / undefined renders no badge.
   */
  bottomPanelUnread?: number;
}

function formatRelative(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const ms = Date.now() - t;
  if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function StatusBar({
  projectName,
  running,
  agentCount,
  events,
  bottomPanelUnread = 0,
}: StatusBarProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const chrome = useChromeLayout();

  // Fetch the project registry on mount + window focus for the branch hint.
  // /api/projects returns RegisteredProject[] (the live row carries the
  // current gitBranch from `git rev-parse --abbrev-ref HEAD` on the
  // daemon side). Dynamic import — lib/api.ts evaluates window.location
  // at module load (SSR-incompatible from layout-level shells).
  useEffect(() => {
    if (!projectName || projectName === "__fallback") return;
    let cancelled = false;
    async function load() {
      try {
        const api = await import("@/lib/api");
        const projects = await api.fetchProjects();
        const hit = projects.find((p) => p.name === projectName);
        if (!cancelled) setBranch(hit?.gitBranch ?? null);
      } catch {
        if (!cancelled) setBranch(null);
      }
    }
    void load();
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [projectName]);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  return (
    <footer
      data-testid="v2-status-bar"
      style={{ height: "24px" }}
      className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-strong)] px-3 text-[11px] text-[var(--fg-muted,var(--fg-secondary))]"
    >
      <button
        type="button"
        onClick={openCommandPalette}
        data-testid="status-bar-branch"
        aria-label="Switch branch (opens command palette)"
        title="Switch branch — opens command palette"
        className="inline-flex items-center gap-1 hover:text-[var(--accent)]"
      >
        <GitBranch aria-hidden="true" size={12} />
        <span>{branch ?? "—"}</span>
      </button>

      <span aria-hidden="true" className="opacity-30">
        │
      </span>

      <span
        data-testid="status-bar-session"
        className="inline-flex items-center gap-1"
        title={running ? "Project session is running" : "Project session is stopped"}
      >
        <span
          aria-hidden="true"
          style={{ color: running ? "var(--accent)" : "var(--dim)" }}
        >
          ●
        </span>
        <span>{projectName}</span>
      </span>

      <span aria-hidden="true" className="opacity-30">
        │
      </span>

      <span data-testid="status-bar-agents" title="Active agent panes">
        {agentCount} {agentCount === 1 ? "agent" : "agents"}
      </span>

      <span aria-hidden="true" className="opacity-30">
        │
      </span>

      <span
        data-testid="status-bar-latest-event"
        className="truncate"
        title={latestEvent ? `${latestEvent.type} · ${latestEvent.message}` : "No recent activity"}
      >
        {latestEvent ? `${latestEvent.type} · ${formatRelative(latestEvent.timestamp)}` : "idle"}
      </span>

      <span className="flex-1" />

      {/* IDE chrome toggles — mirror VSCode's lower-right cluster. */}
      <ChromeToggle
        icon={PanelLeft}
        active={chrome.leftSidebarOpen}
        onClick={toggleLeftSidebar}
        ariaLabel="Toggle Primary Sidebar"
        title="Toggle Primary Sidebar (⌘B)"
        testId="status-bar-toggle-left"
      />
      <ChromeToggle
        icon={PanelBottom}
        active={chrome.bottomPanelOpen}
        onClick={toggleBottomPanel}
        ariaLabel="Toggle Panel"
        title="Toggle Panel (⌘J)"
        testId="status-bar-toggle-bottom"
        badge={!chrome.bottomPanelOpen && bottomPanelUnread > 0 ? bottomPanelUnread : 0}
      />
      <ChromeToggle
        icon={PanelRight}
        active={chrome.rightInspectorOpen}
        onClick={toggleRightInspector}
        ariaLabel="Toggle Secondary Sidebar"
        title="Toggle Secondary Sidebar (⌘⌥B)"
        testId="status-bar-toggle-right"
      />

      <ThemeToggle />
    </footer>
  );
}

interface ChromeToggleProps {
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  title: string;
  testId: string;
  /** Numeric badge for the bottom-panel "unread problems" hint. 0 = hide. */
  badge?: number;
}

function ChromeToggle({
  icon: Icon,
  active,
  onClick,
  ariaLabel,
  title,
  testId,
  badge = 0,
}: ChromeToggleProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title}
      className={
        "relative inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--surface-hover)] " +
        (active ? "text-[var(--fg)]" : "text-[var(--dim)]")
      }
    >
      <Icon aria-hidden="true" size={14} />
      {badge > 0 && (
        <span
          aria-hidden="true"
          data-testid={`${testId}-badge`}
          className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-[var(--red,var(--accent))] px-1 text-[9px] font-medium text-white"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
