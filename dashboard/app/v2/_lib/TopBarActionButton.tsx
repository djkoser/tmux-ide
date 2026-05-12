"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";

interface TopBarActionButtonProps {
  /** Glyph or single-character icon shown inside the button. */
  icon: ReactNode;
  /** Tooltip body — action label, optionally with a · keyboard-shortcut suffix. */
  tooltip: string;
  /** Accessible name. Defaults to `tooltip` when omitted. */
  ariaLabel?: string;
  /** When true, render the pressed/active treatment (left border accent). */
  active?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Optional data-testid for verification. */
  testId?: string;
  /** Slightly enlarge the glyph (used for glyphs that read small in 5-px row). */
  glyphSize?: number;
}

/**
 * Topbar icon button with hover + pressed treatments and a Base UI tooltip
 * anchored below. Use inside `<TooltipProvider>`. Styling matches T045 spec:
 * h-5, px-2, no rounded corners, hover surface-hover, pressed = 2px accent
 * left border.
 */
export function TopBarActionButton({
  icon,
  tooltip,
  ariaLabel,
  active = false,
  onClick,
  type = "button",
  testId,
  glyphSize = 13,
}: TopBarActionButtonProps) {
  const button = (
    <button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel ?? tooltip}
      aria-pressed={active || undefined}
      data-active={active ? "true" : undefined}
      data-testid={testId}
      className={`inline-flex h-5 items-center justify-center px-2 text-[var(--dim)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] ${
        active
          ? "border-l-2 [border-left-color:var(--theme-focused-foreground)] text-[var(--fg)]"
          : ""
      }`}
    >
      <span aria-hidden="true" style={{ fontSize: glyphSize, lineHeight: 1 }}>
        {icon}
      </span>
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Vertical separator used between groups in the topbar (e.g., before the
 * action group). Renders a `|` glyph dimmed via `--dimmer`.
 */
export function TopBarSeparator() {
  return (
    <span aria-hidden="true" className="mx-1 text-[var(--dimmer)]">
      |
    </span>
  );
}
