"use client";

/**
 * ShellSidebarShell — foundation module for migrating consumers off
 * `components/ui/sidebar.tsx` (the Tailwind/Base-UI shadcn shell) onto
 * the TUI `SidebarLayout` + `ActionListItem` primitives.
 *
 * Per T018 audit (research-findings.md, "Base UI Sidebar consumer
 * migration audit") this exposes:
 *
 *   - ShellSidebarShell:    layout host that owns open/collapsed/openMobile
 *                           state, cookie persistence, media query, and the
 *                           Mod+B keyboard shortcut.
 *   - useShellSidebar:      context hook returning the same shape as the
 *                           legacy `useSidebar()` so consumer migrations are
 *                           one-line swaps.
 *   - ShellActionListItem:  thin wrapper around TUI ActionListItem that
 *                           collapses to icon-only with a tooltip-on-hover
 *                           when `state === "collapsed"`.
 *   - CollapsedRail:        layout helper that narrows the rail and clips
 *                           label text when state is collapsed.
 *
 * Lead decisions on T018 open questions baked in:
 *   1. Mobile drawer is preserved (rendered via `@/components/ui/dialog`).
 *   2. Icon-mode uses Tailwind utilities — no separate CSS module file.
 *   3. SidebarRail dropped — `SidebarLayout`'s built-in handle covers the
 *      drag-to-resize affordance.
 *
 * This module COEXISTS with the legacy SidebarProvider for now;
 * G3.S2-S7 migrate consumers off the legacy shell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import SidebarLayout from "@/components/tui/SidebarLayout";
import ActionListItem from "@/components/tui/ActionListItem";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants — mirror the legacy shell so cookie state survives the cut-over.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "sidebar:state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const MOBILE_QUERY = "(max-width: 767px)";
const DEFAULT_KEYBIND = "Mod+b";
const SIDEBAR_WIDTH_CHARS = 28;
const SIDEBAR_WIDTH_ICON_CHARS = 4;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ShellSidebarState = "expanded" | "collapsed";

interface ShellSidebarContextValue {
  state: ShellSidebarState;
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const ShellSidebarContext = createContext<ShellSidebarContextValue | null>(null);

export function useShellSidebar(): ShellSidebarContextValue {
  const ctx = useContext(ShellSidebarContext);
  if (!ctx) {
    throw new Error("useShellSidebar must be used within <ShellSidebarShell>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSidebarCookie(): boolean | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie.split("; ").find((item) => item.startsWith(`${COOKIE_NAME}=`));
  if (!row) return null;
  const value = row.slice(COOKIE_NAME.length + 1);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function writeSidebarCookie(open: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${open}; path=/; max-age=${COOKIE_MAX_AGE}`;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function keybindMatches(event: KeyboardEvent, keybind: string): boolean {
  const parts = keybind.split("+").map((part) => part.trim().toLowerCase());
  const key = parts.pop();
  if (!key || event.key.toLowerCase() !== key) return false;

  const wantsMod = parts.includes("mod");
  const wantsMeta = parts.includes("cmd") || parts.includes("meta");
  const wantsCtrl = parts.includes("ctrl") || parts.includes("control");
  const wantsShift = parts.includes("shift");
  const wantsAlt = parts.includes("alt") || parts.includes("option");

  if (wantsMod) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    if (event.metaKey !== wantsMeta) return false;
    if (event.ctrlKey !== wantsCtrl) return false;
  }
  return event.shiftKey === wantsShift && event.altKey === wantsAlt;
}

// ---------------------------------------------------------------------------
// ShellSidebarShell
// ---------------------------------------------------------------------------

interface ShellSidebarShellProps {
  /**
   * Sidebar contents — typically a tree of ShellActionListItem.
   *
   * Optional. When omitted, ShellSidebarShell runs in context-only mode:
   * no SidebarLayout / Dialog chrome is rendered, only the context
   * provider and TooltipProvider. Use this during the migration to host
   * the new context above legacy SidebarProvider trees that still own
   * the visible sidebar themselves.
   */
  sidebar?: ReactNode;
  /** The right-hand main content. */
  children: ReactNode;
  /** Initial open state when no cookie is present. */
  defaultOpen?: boolean;
  /** Controlled open state. When omitted the shell manages its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Keyboard shortcut to toggle. Pass `null` to disable. */
  keyboardShortcut?: string | null;
  /** Optional className passed onto the SidebarLayout root. */
  className?: string;
  /** Optional style passed onto the SidebarLayout root. */
  style?: CSSProperties;
}

export function ShellSidebarShell({
  sidebar,
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  keyboardShortcut = DEFAULT_KEYBIND,
  className,
  style,
}: ShellSidebarShellProps) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [internalOpen, setInternalOpen] = useState(() => readSidebarCookie() ?? defaultOpen);
  const open = openProp ?? internalOpen;

  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(open) : value;
      if (onOpenChange) onOpenChange(next);
      else setInternalOpen(next);
      writeSidebarCookie(next);
    },
    [open, onOpenChange],
  );

  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((value) => !value);
    else setOpen((value) => !value);
  }, [isMobile, setOpen]);

  useEffect(() => {
    if (!keyboardShortcut || keyboardShortcut === "none") return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !keybindMatches(event, keyboardShortcut)) return;
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyboardShortcut, toggleSidebar]);

  const state: ShellSidebarState = open ? "expanded" : "collapsed";

  const ctxValue = useMemo<ShellSidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, openMobile, isMobile, toggleSidebar],
  );

  // Context-only mode: no sidebar slot — render just the children with
  // the new context attached. Legacy consumers nested below still own
  // their own layout (e.g. an inner SidebarProvider).
  if (sidebar === undefined || sidebar === null) {
    return (
      <ShellSidebarContext.Provider value={ctxValue}>
        <TooltipProvider delay={200}>
          {className || style ? (
            <div data-shell-sidebar="context-only" className={cn(className)} style={style}>
              {children}
            </div>
          ) : (
            children
          )}
        </TooltipProvider>
      </ShellSidebarContext.Provider>
    );
  }

  // Mobile: sidebar lives in an off-canvas Dialog, main content uses the
  // full viewport width. Desktop: use TUI SidebarLayout.
  if (isMobile) {
    return (
      <ShellSidebarContext.Provider value={ctxValue}>
        <TooltipProvider delay={200}>
          <Dialog open={openMobile} onOpenChange={setOpenMobile}>
            <DialogContent
              className="left-0 top-0 h-screen w-[18rem] translate-x-0 translate-y-0 rounded-none p-0"
              data-testid="shell-sidebar-mobile"
            >
              <DialogHeader className="sr-only">
                <DialogTitle>Sidebar</DialogTitle>
                <DialogDescription>Project navigation</DialogDescription>
              </DialogHeader>
              {sidebar}
            </DialogContent>
          </Dialog>
          <div
            data-shell-sidebar="mobile"
            className={cn("flex h-full min-h-0 flex-1", className)}
            style={style}
          >
            {children}
          </div>
        </TooltipProvider>
      </ShellSidebarContext.Provider>
    );
  }

  // Desktop: render via TUI SidebarLayout. When collapsed, wrap the same
  // sidebar JSX in <CollapsedRail> so labels clip and ShellActionListItems
  // collapse to icon-only — consumers don't have to fork their tree.
  const sidebarContent = state === "collapsed" ? <CollapsedRail>{sidebar}</CollapsedRail> : sidebar;
  const widthChars = state === "collapsed" ? SIDEBAR_WIDTH_ICON_CHARS : SIDEBAR_WIDTH_CHARS;

  return (
    <ShellSidebarContext.Provider value={ctxValue}>
      <TooltipProvider delay={200}>
        <div
          data-shell-sidebar="desktop"
          data-shell-sidebar-state={state}
          className={cn("flex min-h-0 flex-1", className)}
          style={style}
        >
          <SidebarLayout
            key={state /* re-mount on state change so defaultSidebarWidth re-applies */}
            sidebar={sidebarContent}
            defaultSidebarWidth={widthChars}
            isShowingHandle
          >
            {children}
          </SidebarLayout>
        </div>
      </TooltipProvider>
    </ShellSidebarContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// CollapsedRail
// ---------------------------------------------------------------------------

interface CollapsedRailProps {
  children: ReactNode;
  className?: string;
}

/**
 * Layout helper rendered by ShellSidebarShell when the sidebar is collapsed.
 * Constrains width and applies a `data-shell-collapsed` ancestor that
 * ShellActionListItem reads via CSS to hide labels.
 *
 * Consumers can also use this directly in tests or storybook to preview
 * collapsed-mode rendering of an arbitrary subtree.
 */
export function CollapsedRail({ children, className }: CollapsedRailProps) {
  return (
    <div
      data-shell-collapsed="true"
      className={cn(
        "flex h-full w-full flex-col items-stretch overflow-y-auto overflow-x-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShellActionListItem
// ---------------------------------------------------------------------------

interface ShellActionListItemProps {
  /** Icon node — single character glyph or small element. Required for
   *  collapsed mode; without one, the row reduces to an empty cell. */
  icon?: ReactNode;
  /** Visible label in expanded mode. Doubles as the tooltip text in
   *  collapsed mode if `tooltip` is not provided. */
  children: ReactNode;
  /** Override the collapsed-mode tooltip text. Defaults to `children`
   *  rendered as a string. */
  tooltip?: string;
  href?: string;
  target?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement | HTMLAnchorElement>) => void;
  role?: string;
  /** When true, render with active styling. Visual only — no behavior. */
  active?: boolean;
  /** data-testid forwarded to the rendered element. */
  testId?: string;
}

/**
 * Wrapper around TUI `ActionListItem` that:
 *   - hides its label when the parent shell is in collapsed state, and
 *   - shows a tooltip on hover with the original label.
 *
 * Reads collapsed state from `useShellSidebar()` if present; falls back to
 * the closest `[data-shell-collapsed="true"]` DOM ancestor (so it works
 * even when used inside `<CollapsedRail>` outside of a shell, e.g. tests).
 */
export function ShellActionListItem({
  icon,
  children,
  tooltip,
  href,
  target,
  onClick,
  role,
  active = false,
  testId,
}: ShellActionListItemProps) {
  const ctx = useContext(ShellSidebarContext);
  const collapsed = ctx?.state === "collapsed";
  const tooltipText = tooltip ?? (typeof children === "string" ? children : undefined);

  const baseStyle: CSSProperties = active
    ? { backgroundColor: "var(--surface-active)", color: "var(--accent)" }
    : {};

  // onClick lives on the wrapper rather than on TUI ActionListItem so that
  //   1. testing-library `fireEvent.click(getByTestId(testId))` reaches the
  //      handler — testId is on the wrapper, and React doesn't bubble
  //      synthetic clicks down to descendants.
  //   2. Clicks on the `<a>` href branch (which TUI ActionListItem renders
  //      without wiring onClick) still reach our handler via DOM bubbling.
  // Native `<a>` navigation still happens; consumers that need to suppress
  // it call `event.preventDefault()` from their handler.
  const item = (
    <div
      data-testid={testId}
      data-active={active ? "true" : "false"}
      // When inside CollapsedRail, hide [data-shell-label] via the CSS rule below.
      data-shell-action-list-item=""
      onClick={onClick}
    >
      <ActionListItem
        icon={<span data-shell-icon="">{icon}</span>}
        href={href}
        target={target}
        role={role}
        style={baseStyle}
      >
        <span data-shell-label="">{children}</span>
      </ActionListItem>
      {/* Tailwind-only "shim" for collapsed mode: when an ancestor has
          data-shell-collapsed, hide the label span. Inline so this module
          doesn't need a CSS file. */}
      <style>{collapsedStyleSheet}</style>
    </div>
  );

  if (!collapsed || !tooltipText) return item;

  return (
    <Tooltip>
      <TooltipTrigger render={item} />
      <TooltipContent side="right" sideOffset={6}>
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

// One-shot inline stylesheet. Hides [data-shell-label] under a collapsed
// ancestor; trims the trailing whitespace TUI ActionListItem renders for
// the row text. Safe to inject many times — browsers dedupe identical text
// via the constructable-stylesheet path or simply pay a tiny parse cost.
const collapsedStyleSheet = `
  [data-shell-collapsed="true"] [data-shell-label] { display: none; }
  [data-shell-collapsed="true"] [data-shell-action-list-item] { width: 100%; }
`;
