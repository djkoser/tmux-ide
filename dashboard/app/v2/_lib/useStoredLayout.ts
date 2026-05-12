"use client";

import { useCallback, useEffect, useState } from "react";
import type { Layout } from "react-resizable-panels";

const VERSION = "v1";
const PREFIX = "tmux-ide.v2.layout";

function storageKey(key: string): string {
  return `${PREFIX}.${VERSION}.${key}`;
}

function readLayout(key: string): Layout | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const out: Layout = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function writeLayout(key: string, layout: Layout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(layout));
  } catch {
    /* swallow — quota / disabled storage */
  }
}

export function useStoredLayout(key: string): [Layout | undefined, (layout: Layout) => void] {
  const [hydrated, setHydrated] = useState(false);
  const [layout, setLayout] = useState<Layout | undefined>(undefined);

  useEffect(() => {
    setLayout(readLayout(key));
    setHydrated(true);
  }, [key]);

  const onChange = useCallback(
    (next: Layout) => {
      setLayout(next);
      writeLayout(key, next);
    },
    [key],
  );

  return [hydrated ? layout : undefined, onChange];
}
