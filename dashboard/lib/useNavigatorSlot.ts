"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";

/**
 * Navigator slot store
 *
 * Views (e.g. PlansView) register a navigator subtree via <NavigatorPortal>.
 * The shell layout reads the active navigator via useNavigatorSlot() and
 * renders it in a fixed-width column between AppSidebar and the main content.
 *
 * Multiple registrations are supported (LIFO): the most recently mounted
 * portal wins. When that portal unmounts, the previous registration is
 * restored. This keeps things deterministic when views nest portals or when
 * a stale tab unmounts after a route change.
 *
 * SSR safety: the server snapshot always returns null so the initial HTML
 * matches the first client render.
 */

interface Registration {
  id: string;
  node: ReactNode;
}

const listeners = new Set<() => void>();
let registrations: Registration[] = [];
let activeNode: ReactNode = null;

function recompute() {
  const next = registrations.length > 0 ? registrations[registrations.length - 1]!.node : null;
  if (next === activeNode) return;
  activeNode = next;
  for (const listener of listeners) listener();
}

function register(id: string, node: ReactNode): void {
  const index = registrations.findIndex((entry) => entry.id === id);
  if (index === -1) {
    registrations = [...registrations, { id, node }];
  } else {
    const next = registrations.slice();
    next[index] = { id, node };
    registrations = next;
  }
  recompute();
}

function unregister(id: string): void {
  const next = registrations.filter((entry) => entry.id !== id);
  if (next.length === registrations.length) return;
  registrations = next;
  recompute();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReactNode {
  return activeNode;
}

function getServerSnapshot(): ReactNode {
  return null;
}

/**
 * Subscribe to the active navigator node. Returns ReactNode | null.
 * The shell layout reads this and renders the node in the navigator slot.
 */
export function useNavigatorSlot(): ReactNode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface NavigatorPortalProps {
  children: ReactNode;
}

/**
 * Mounts `children` into the shell's navigator slot for the lifetime of the
 * component. Re-renders inside `children` are reflected live because this
 * component re-registers on every render.
 *
 * Multiple portals stack LIFO — the most recently mounted wins. When a
 * portal unmounts, the previous one is restored automatically.
 */
export function NavigatorPortal({ children }: NavigatorPortalProps) {
  const id = useId();
  // Register synchronously on each render so that `children` updates flow
  // through to the consumer immediately. The cleanup runs only when the
  // component unmounts (not on each render) because `id` is stable.
  register(id, children);

  useEffect(() => {
    return () => {
      unregister(id);
    };
  }, [id]);

  return null;
}

/** Test-only reset. Not exported from public index. */
export function __resetNavigatorSlotForTests(): void {
  registrations = [];
  activeNode = null;
  for (const listener of listeners) listener();
}
