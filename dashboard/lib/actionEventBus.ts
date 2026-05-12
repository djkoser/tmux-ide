"use client";

import { useEffect } from "react";
import { subscribeGlobal, type ServerFrame } from "@/lib/wsBus";

/**
 * Action event bridge — a tiny, decoupled adapter that turns server
 * `action.complete` and `config.changed` push frames into DOM
 * `CustomEvent`s on `window`. Components opt in by registering a normal
 * `addEventListener`, which lets them invalidate caches without taking a
 * hard dependency on the WebSocket bus.
 *
 * Wire frames (server-side, frozen):
 *
 *   { type: "action.complete", name, result }
 *   { type: "config.changed",  sessionName }
 *
 * Window event names (consumer-facing, frozen):
 *
 *   "tmux-ide:action.complete"  — detail: { name, result }
 *   "tmux-ide:config.changed"   — detail: { sessionName }
 *
 * The bridge is reference-counted: the first call to `enableActionEventBridge`
 * subscribes globally to the WS bus; subsequent calls bump the refcount.
 * Releasing all refs detaches the listener so we never leak an idle
 * subscription. Mirror of `projectStore.ts`'s pattern.
 *
 * In normal app usage there's exactly one consumer (mounted at the app
 * shell), so the refcount stays at 1 for the life of the app. The
 * mechanism is here so tests can mount/unmount cleanly.
 */

export const ACTION_COMPLETE_EVENT = "tmux-ide:action.complete";
export const CONFIG_CHANGED_EVENT = "tmux-ide:config.changed";

export interface ActionCompleteDetail {
  /** Action name from `command-center/actions/contract.ts`. */
  name: string;
  /** Action-specific result envelope. Loose because each action has its
   * own result shape; consumers narrow on the action they care about. */
  result: unknown;
}

export interface ConfigChangedDetail {
  sessionName: string;
}

interface BridgeInternals {
  refCount: number;
  release: (() => void) | null;
}

const bridge: BridgeInternals = {
  refCount: 0,
  release: null,
};

/**
 * Read the `action.complete` payload from a frame, or `null` if the frame
 * is the wrong type / malformed. `ServerFrame` in the dashboard is narrower
 * than the server's union (it doesn't yet include the new variants), so we
 * read fields off a duck-typed shape rather than narrowing the union.
 */
function readActionCompleteFrame(
  frame: ServerFrame,
): { name: string; result: unknown } | null {
  const candidate = frame as { type?: unknown; name?: unknown; result?: unknown };
  if (candidate.type !== "action.complete") return null;
  if (typeof candidate.name !== "string") return null;
  return { name: candidate.name, result: candidate.result };
}

function readConfigChangedFrame(frame: ServerFrame): { sessionName: string } | null {
  const candidate = frame as { type?: unknown; sessionName?: unknown };
  if (candidate.type !== "config.changed") return null;
  if (typeof candidate.sessionName !== "string") return null;
  return { sessionName: candidate.sessionName };
}

function dispatchWindow<T>(name: string, detail: T): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<T>(name, { detail }));
  } catch {
    // CustomEvent can throw under exotic globals; never break the bus.
  }
}

function handleFrame(frame: ServerFrame): void {
  const action = readActionCompleteFrame(frame);
  if (action) {
    const detail: ActionCompleteDetail = { name: action.name, result: action.result };
    dispatchWindow(ACTION_COMPLETE_EVENT, detail);
    return;
  }
  const config = readConfigChangedFrame(frame);
  if (config) {
    const detail: ConfigChangedDetail = { sessionName: config.sessionName };
    dispatchWindow(CONFIG_CHANGED_EVENT, detail);
    return;
  }
}

/**
 * Acquire a ref on the global bridge. The first ref opens the WS
 * subscription; subsequent refs no-op. Returns a release function that
 * decrements the refcount and detaches when it hits zero.
 */
export function enableActionEventBridge(): () => void {
  bridge.refCount += 1;
  if (bridge.refCount === 1) {
    bridge.release = subscribeGlobal(handleFrame);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bridge.refCount = Math.max(0, bridge.refCount - 1);
    if (bridge.refCount === 0) {
      bridge.release?.();
      bridge.release = null;
    }
  };
}

/**
 * React hook variant — mounts the bridge for the lifetime of a component.
 * Designed for the app shell (`AppShell` / `EventBridge`-style host).
 */
export function useActionEventBridge(): void {
  useEffect(() => {
    const release = enableActionEventBridge();
    return release;
  }, []);
}

/**
 * Test-only escape hatch. Resets the singleton so each test starts clean.
 */
export const __resetActionEventBridgeForTests = (): void => {
  bridge.release?.();
  bridge.release = null;
  bridge.refCount = 0;
};
