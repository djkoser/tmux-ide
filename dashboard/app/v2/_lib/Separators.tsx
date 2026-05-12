"use client";

import { Separator } from "react-resizable-panels";

/**
 * VS Code-style resizer chrome for react-resizable-panels.
 *
 * Visual contract:
 *   rest    → 1px line in --border-weak, near-invisible
 *   hover   → 1px line in --theme-focused-foreground-subdued
 *   drag    → 1px line in --theme-focused-foreground (matches IDE accent)
 *
 * Hit area: a 6px transparent overlay (3px to each side of the visible line)
 * via CSS pseudo-element. Tailwind's arbitrary-value pseudo-element syntax
 * doesn't compose reliably across Next + Tailwind v4, so the hit area lives
 * inline.
 */

const baseHandle =
  "group relative bg-[var(--border-weak)] transition-colors duration-150 ease-smooth hover:bg-[var(--theme-focused-foreground-subdued)] data-[resize-handle-active]:bg-[var(--theme-focused-foreground)]";

export function VSeparator({ className = "" }: { className?: string }) {
  return (
    <Separator
      className={`${baseHandle} w-px ${className}`}
      style={{
        // Forgiving 6px grab zone via inline shadow trick
        boxShadow: "0 0 0 3px transparent",
        cursor: "col-resize",
      }}
    />
  );
}

export function HSeparator({ className = "" }: { className?: string }) {
  return (
    <Separator
      className={`${baseHandle} h-px ${className}`}
      style={{
        boxShadow: "0 0 0 3px transparent",
        cursor: "row-resize",
      }}
    />
  );
}
