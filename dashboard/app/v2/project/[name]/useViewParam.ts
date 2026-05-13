"use client";

/**
 * URL-synced view state for `/v2/project/[name]`. The active view is
 * derived from `?view=<id>` so deep-links (palette → skill / task /
 * thread, or just hitting back/forward in the browser) reload onto the
 * same surface the user left.
 *
 * Pattern is a thin wrapper around Next's `useRouter` +
 * `useSearchParams`:
 *   - Read: `view = searchParams.get("view") ?? defaultView` (gated by
 *     the caller's validator so an unknown value falls back instead of
 *     leaking through as the active id).
 *   - Write: `router.replace(pathname + search, { scroll: false })`,
 *     which updates the URL in place without a navigation. The default
 *     view drops the param so the canonical URL stays clean (the
 *     project page already defaults to `kanban`, so `/v2/project/foo`
 *     and `/v2/project/foo?view=kanban` are equivalent — keep the
 *     shorter form).
 *
 * Test surface: this hook is split out of the page so a small harness
 * can exercise the URL ↔ state binding under a mocked next/navigation
 * (the page itself is huge and pulls in too many bridges to mount).
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useViewParam<T extends string>(
  defaultView: T,
  isValid: (v: string) => v is T,
): readonly [T, (next: T) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");

  const view = useMemo<T>(() => {
    if (rawView && isValid(rawView)) return rawView;
    return defaultView;
  }, [rawView, isValid, defaultView]);

  const setView = useCallback(
    (next: T) => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (next === defaultView) {
        url.searchParams.delete("view");
      } else {
        url.searchParams.set("view", next);
      }
      const target = url.pathname + (url.search ? url.search : "");
      router.replace(target, { scroll: false });
    },
    [router, defaultView],
  );

  return [view, setView] as const;
}
