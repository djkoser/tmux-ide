"use client";

import { openCommandPalette } from "@/components/CommandPalette";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";

/**
 * VS Code-style vertical activity bar.
 *
 * Lives at the far left edge of /v2/project/[name]. The "VIEWS" list inside
 * ProjectSidebar becomes the secondary panel toggled by activity-bar
 * selection. Buttons that map to a real ViewId switch the page's `view`
 * state; non-view buttons (Search) trigger ad-hoc actions.
 *
 * Width is a fixed 48px column with a right border. Icons are top-aligned;
 * a bottom group hosts the account avatar + settings affordance.
 */

export type ActivityBarViewId =
  | "files"
  | "diffs"
  | "plans"
  | "tasks"
  | "mission"
  | "chat"
  | "terminal";

interface ActivityBarItem {
  id: ActivityBarViewId | "search" | "settings" | "account";
  glyph: string;
  label: string;
  /** Tooltip text — defaults to label when omitted. */
  tooltip?: string;
  /** When omitted, the click handler is a no-op (placeholder for future
   *  surfaces). */
  onClick?: () => void;
  /** When provided, render as the active item if it matches the current
   *  page view. */
  view?: ActivityBarViewId;
  /** Slightly larger glyph render. */
  glyphSize?: number;
}

interface V2ActivityBarProps {
  /** Current page view id; used to compute the active treatment. */
  view: string;
  /** Switch the page to a new view id. */
  onView: (id: ActivityBarViewId) => void;
}

export function V2ActivityBar({ view, onView }: V2ActivityBarProps) {
  const top: ActivityBarItem[] = [
    {
      id: "files",
      view: "files",
      glyph: "▤",
      label: "Files",
      tooltip: "Files",
      onClick: () => onView("files"),
    },
    {
      id: "search",
      glyph: "⌕",
      label: "Search",
      tooltip: "Search · ⌘K",
      onClick: openCommandPalette,
      glyphSize: 16,
    },
    {
      id: "diffs",
      view: "diffs",
      glyph: "⎇",
      label: "Diffs",
      tooltip: "Diffs",
      onClick: () => onView("diffs"),
    },
    {
      id: "plans",
      view: "plans",
      glyph: "▦",
      label: "Plans",
      tooltip: "Plans",
      onClick: () => onView("plans"),
    },
    {
      id: "tasks",
      view: "tasks",
      glyph: "≡",
      label: "Tasks",
      tooltip: "Tasks",
      onClick: () => onView("tasks"),
      glyphSize: 16,
    },
    {
      id: "mission",
      view: "mission",
      glyph: "◆",
      label: "Mission",
      tooltip: "Mission",
      onClick: () => onView("mission"),
    },
    {
      id: "chat",
      view: "chat",
      glyph: "✎",
      label: "Chat",
      tooltip: "Chat",
      onClick: () => onView("chat"),
    },
    {
      id: "terminal",
      view: "terminal",
      glyph: ">_",
      label: "Terminal",
      tooltip: "Terminal",
      onClick: () => onView("terminal"),
      glyphSize: 11,
    },
  ];

  const bottom: ActivityBarItem[] = [
    {
      id: "account",
      glyph: "◉",
      label: "Account",
      tooltip: "Account",
    },
    {
      id: "settings",
      glyph: "⚙",
      label: "Settings",
      tooltip: "Settings",
    },
  ];

  return (
    <TooltipProvider delay={200}>
      <nav
        aria-label="Activity bar"
        data-testid="v2-activity-bar"
        className="flex h-full w-12 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex flex-col">
          {top.map((item) => (
            <ActivityBarButton
              key={item.id}
              item={item}
              active={item.view !== undefined && item.view === view}
            />
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex flex-col">
          {bottom.map((item) => (
            <ActivityBarButton key={item.id} item={item} active={false} />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  );
}

function ActivityBarButton({ item, active }: { item: ActivityBarItem; active: boolean }) {
  const trigger = (
    <button
      type="button"
      aria-label={item.label}
      aria-pressed={active || undefined}
      data-testid={`v2-activity-${item.id}`}
      data-active={active ? "true" : undefined}
      onClick={item.onClick}
      className={`relative flex h-9 w-12 shrink-0 items-center justify-center transition-colors hover:text-[var(--fg)] ${
        active ? "text-[var(--fg)]" : "text-[var(--dim)]"
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1 bottom-1 w-[2px] bg-[var(--accent)]"
        />
      )}
      <span aria-hidden="true" style={{ fontSize: item.glyphSize ?? 14, lineHeight: 1 }}>
        {item.glyph}
      </span>
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent side="right">{item.tooltip ?? item.label}</TooltipContent>
    </Tooltip>
  );
}
