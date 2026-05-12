"use client";

/**
 * Thin facade over @pierre/diffs/react PatchDiff.
 *
 * Two responsibilities:
 *   1. Inject the registered tui-dark / tui-light theme based on next-themes
 *      so consumers don't repeat the inline theme literal.
 *   2. Clamp the option surface to (diffStyle | themeType | overflow) — the
 *      three knobs both consumers actually flex. Everything else is a
 *      consistent default.
 *
 * `preloaded` is passed straight through so server-rendered diffs continue
 * to work; in that branch the wrapper does not inject options (the SSR
 * payload already contains them).
 */

import { PatchDiff as BasePatchDiff } from "@pierre/diffs/react";
import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { TUI_DARK, TUI_LIGHT, registerTuiThemes } from "./tui-themes";

interface PatchDiffProps {
  patch: string;
  diffStyle?: "split" | "unified";
  className?: string;
  style?: CSSProperties;
  /** Server-rendered payload from `@pierre/diffs/ssr` — when present we
   *  forward it as-is and skip the options branch. */
  preloaded?: Record<string, unknown>;
}

export function PatchDiff({
  patch,
  diffStyle = "split",
  className,
  style,
  preloaded,
}: PatchDiffProps) {
  registerTuiThemes();
  const { theme } = useTheme();
  const isDark = theme !== "light";

  if (preloaded) {
    return <BasePatchDiff patch={patch} {...preloaded} className={className} style={style} />;
  }

  return (
    <BasePatchDiff
      patch={patch}
      className={className}
      style={style}
      options={{
        theme: isDark ? TUI_DARK : TUI_LIGHT,
        themeType: isDark ? "dark" : "light",
        diffStyle,
        diffIndicators: "bars",
        overflow: "scroll",
      }}
    />
  );
}
