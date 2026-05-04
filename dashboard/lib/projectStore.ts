"use client";

import { useEffect, useState } from "react";
import { fetchProjects, type RegisteredProject } from "@/lib/api";
import { subscribeGlobal, type ServerFrame } from "@/lib/wsBus";

/**
 * Project registry store.
 *
 * Module-level cache shared across consumers — first mount triggers a REST
 * fetch, subsequent mounts hit the cache. A single global WS listener
 * refetches the list on `projects.changed` push frames so every consumer
 * stays in sync without each opening its own WebSocket.
 *
 * Mirrors the shape of `useSessionStream` (channel + reference-counted
 * subscribe/release). The store has no notion of an "active project" — it
 * just owns the list of registered projects.
 *
 * Wire frame (Agent 1 implements server-side identically):
 *
 *   { type: "projects.changed" }
 *
 * The bus delivers this through `subscribeGlobal` (no sessionName attached).
 */

interface StoreState {
  projects: RegisteredProject[];
  loading: boolean;
  error: boolean;
}

const INITIAL_STATE: StoreState = {
  projects: [],
  loading: true,
  error: false,
};

interface StoreInternals {
  state: StoreState;
  subscribers: Set<(s: StoreState) => void>;
  release: (() => void) | null;
  refetching: boolean;
  initialized: boolean;
}

const store: StoreInternals = {
  state: INITIAL_STATE,
  subscribers: new Set(),
  release: null,
  refetching: false,
  initialized: false,
};

function setState(next: StoreState | ((prev: StoreState) => StoreState)): void {
  const resolved = typeof next === "function" ? next(store.state) : next;
  if (resolved === store.state) return;
  store.state = resolved;
  for (const listener of store.subscribers) listener(resolved);
}

async function refresh(): Promise<void> {
  if (store.refetching) return;
  store.refetching = true;
  try {
    const projects = await fetchProjects();
    setState((current) => ({ ...current, projects, loading: false, error: false }));
  } catch {
    setState((current) => ({ ...current, loading: false, error: true }));
  } finally {
    store.refetching = false;
  }
}

function isProjectsChangedFrame(frame: ServerFrame | { type: string }): boolean {
  return (frame as { type?: unknown }).type === "projects.changed";
}

function handleFrame(frame: ServerFrame): void {
  if (isProjectsChangedFrame(frame)) {
    void refresh();
  }
}

function ensureConnected(): void {
  if (store.release) return;
  store.release = subscribeGlobal(handleFrame);
}

function maybeTeardown(): void {
  if (store.subscribers.size > 0) return;
  store.release?.();
  store.release = null;
  // Keep `initialized` true so re-mounts don't refetch unnecessarily; we
  // rely on `projects.changed` to invalidate. The cached data stays valid.
}

function subscribe(listener: (s: StoreState) => void): () => void {
  store.subscribers.add(listener);
  if (!store.initialized) {
    store.initialized = true;
    void refresh();
  }
  ensureConnected();
  // Push current snapshot so late subscribers don't render INITIAL.
  listener(store.state);
  return () => {
    store.subscribers.delete(listener);
    maybeTeardown();
  };
}

export function useProjects(): StoreState {
  const [state, setLocal] = useState<StoreState>(store.state);
  useEffect(() => {
    const release = subscribe((next) => setLocal(next));
    return () => release();
  }, []);
  return state;
}

/**
 * Imperative refresh — call after a successful mutation if you want the
 * list updated before the server's `projects.changed` frame lands. The bus
 * push is the source of truth; this is just an optimistic shortcut.
 */
export function refreshProjects(): Promise<void> {
  return refresh();
}

/**
 * Test-only escape hatch. Resets the module-level singleton state so each
 * test starts clean.
 */
export const __resetProjectStoreForTests = (): void => {
  store.release?.();
  store.release = null;
  store.subscribers.clear();
  store.refetching = false;
  store.initialized = false;
  store.state = INITIAL_STATE;
};
