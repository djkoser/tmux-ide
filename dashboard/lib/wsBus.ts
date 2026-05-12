"use client";

import {
  API_BASE,
  type EventData,
  type MilestoneData,
  type MissionDetail,
  type SkillData,
} from "@/lib/api";
import type { AgentDetail, Goal, ProjectDetail, SessionOverview, Task } from "@/lib/types";

/**
 * Snapshot payload carried by the `snapshot` server frame. Defined here (not
 * imported from `useSessionStream`) because that module imports this one.
 */
export interface SessionSnapshot {
  project: ProjectDetail | null;
  mission: MissionDetail | null;
  milestones: MilestoneData[];
  goals: Goal[];
  tasks: Task[];
  skills: SkillData[];
  agents: AgentDetail[];
  events: EventData[];
}

/**
 * Singleton WebSocket bus that multiplexes server-pushed updates over a single
 * connection. Replaces a fan of per-component / per-session SSE streams that
 * previously hit Chrome's 6-per-origin HTTP/1.1 connection cap and froze the
 * dashboard.
 *
 * Wire protocol (frozen — Agent 1 implements server side identically):
 *
 *   ClientFrame:
 *     { type: "subscribe",   sessions: string[] }
 *     { type: "unsubscribe", sessions: string[] }
 *     { type: "ping" }
 *
 *   ServerFrame:
 *     { type: "hello", sessions: SessionOverview[] }
 *     { type: "snapshot", sessionName, data: SessionSnapshot }
 *     { type: "task.changed" | "mission.changed" | "milestone.changed"
 *           | "goal.changed"  | "agent.changed", sessionName }
 *     { type: "event.appended", sessionName, event: EventData }
 *     { type: "sessions.changed" }
 *     { type: "pong" }
 */

export type ClientFrame =
  | { type: "subscribe"; sessions: string[] }
  | { type: "unsubscribe"; sessions: string[] }
  | { type: "ping" };

export type ServerFrame =
  | { type: "hello"; sessions: SessionOverview[] }
  | { type: "snapshot"; sessionName: string; data: SessionSnapshot }
  | { type: "task.changed"; sessionName: string }
  | { type: "mission.changed"; sessionName: string }
  | { type: "milestone.changed"; sessionName: string }
  | { type: "goal.changed"; sessionName: string }
  | { type: "agent.changed"; sessionName: string }
  | { type: "event.appended"; sessionName: string; event: EventData }
  | { type: "sessions.changed" }
  | { type: "pong" };

export type WsState = "connecting" | "open" | "closed";

type Listener = (frame: ServerFrame) => void;

interface BusInternals {
  socket: WebSocket | null;
  state: WsState;
  backoff: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  idleCloseTimer: ReturnType<typeof setTimeout> | null;
  /** Reference-counted set of subscribed sessions. Multiple listeners on one
   * session keep its refcount > 0; we only emit `unsubscribe` for that session
   * when its refcount drops to 0. */
  sessionRefs: Map<string, number>;
  /** Listeners scoped to a single session (only fired for matching frames). */
  perSession: Map<string, Set<Listener>>;
  /** Listeners that receive every frame regardless of `sessionName`. */
  global: Set<Listener>;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
/** How long to keep the WS open after the last subscriber unsubscribes.
 * Avoids tearing down + reopening on quick view changes. */
const IDLE_CLOSE_DELAY_MS = 5_000;

const bus: BusInternals = {
  socket: null,
  state: "closed",
  backoff: INITIAL_BACKOFF_MS,
  reconnectTimer: null,
  idleCloseTimer: null,
  sessionRefs: new Map(),
  perSession: new Map(),
  global: new Set(),
};

function wsUrl(): string {
  // Reuse api.ts' API_BASE so we inherit the IPv6/localhost workaround.
  // API_BASE may be empty during SSR / build; callers must guard typeof
  // WebSocket before invoking, so we don't try to construct a URL here.
  if (!API_BASE) return "";
  const wsBase = API_BASE.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`);
  return `${wsBase}/ws/events`;
}

function setState(next: WsState): void {
  if (bus.state === next) return;
  bus.state = next;
}

function clearTimer(key: "reconnectTimer" | "idleCloseTimer"): void {
  const t = bus[key];
  if (t) {
    clearTimeout(t);
    bus[key] = null;
  }
}

function send(frame: ClientFrame): void {
  const sock = bus.socket;
  if (!sock || sock.readyState !== WebSocket.OPEN) return;
  try {
    sock.send(JSON.stringify(frame));
  } catch {
    // Swallow — onclose will fire and trigger reconnect.
  }
}

/** Send the current full subscription set. Used on connect + reconnect. */
function sendCurrentSubscriptions(): void {
  if (bus.sessionRefs.size === 0) return;
  send({ type: "subscribe", sessions: Array.from(bus.sessionRefs.keys()) });
}

function dispatchFrame(frame: ServerFrame): void {
  // Global listeners always get every frame.
  for (const listener of bus.global) {
    try {
      listener(frame);
    } catch {
      /* listener errors must not break the bus */
    }
  }
  // Per-session listeners receive only frames whose sessionName matches.
  // Frames without a sessionName ("sessions.changed", "pong", "hello") are
  // global-only and don't fan out to per-session listeners.
  const sessionName = (frame as { sessionName?: string }).sessionName;
  if (!sessionName) return;
  const listeners = bus.perSession.get(sessionName);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(frame);
    } catch {
      /* listener errors must not break the bus */
    }
  }
}

function parseFrame(data: unknown): ServerFrame | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as ServerFrame;
    if (!parsed || typeof parsed.type !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function ensureConnected(): void {
  if (typeof WebSocket === "undefined") return;
  if (bus.socket) return; // connecting or open
  clearTimer("idleCloseTimer");
  const url = wsUrl();
  if (!url) return;
  setState("connecting");
  let sock: WebSocket;
  try {
    sock = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  bus.socket = sock;

  sock.onopen = () => {
    if (bus.socket !== sock) return;
    bus.backoff = INITIAL_BACKOFF_MS;
    setState("open");
    sendCurrentSubscriptions();
  };

  sock.onmessage = (event: MessageEvent<unknown>) => {
    if (bus.socket !== sock) return;
    const frame = parseFrame(event.data);
    if (!frame) return;
    dispatchFrame(frame);
  };

  sock.onerror = () => {
    // Let onclose handle teardown; some browsers fire only one of the two.
  };

  sock.onclose = () => {
    if (bus.socket !== sock) return;
    bus.socket = null;
    setState("closed");
    if (bus.sessionRefs.size === 0 && bus.global.size === 0) {
      // No one listening — don't reconnect.
      return;
    }
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (bus.reconnectTimer) return;
  const delay = bus.backoff;
  bus.backoff = Math.min(delay * 2, MAX_BACKOFF_MS);
  bus.reconnectTimer = setTimeout(() => {
    bus.reconnectTimer = null;
    if (bus.sessionRefs.size === 0 && bus.global.size === 0) return;
    ensureConnected();
  }, delay);
}

function maybeScheduleIdleClose(): void {
  if (bus.sessionRefs.size > 0 || bus.global.size > 0) return;
  if (!bus.socket) return;
  clearTimer("idleCloseTimer");
  bus.idleCloseTimer = setTimeout(() => {
    bus.idleCloseTimer = null;
    if (bus.sessionRefs.size > 0 || bus.global.size > 0) return;
    bus.socket?.close();
    bus.socket = null;
    setState("closed");
    clearTimer("reconnectTimer");
    bus.backoff = INITIAL_BACKOFF_MS;
  }, IDLE_CLOSE_DELAY_MS);
}

/**
 * Subscribe to all push frames for a single session. The first subscriber for
 * a session sends a `subscribe` frame; the last unsubscribe sends an
 * `unsubscribe` frame but keeps the WS open (idle-close after a grace period).
 */
export function subscribeSession(sessionName: string, listener: Listener): () => void {
  if (typeof WebSocket === "undefined") {
    return () => {
      /* no-op on SSR */
    };
  }

  let listeners = bus.perSession.get(sessionName);
  if (!listeners) {
    listeners = new Set();
    bus.perSession.set(sessionName, listeners);
  }
  listeners.add(listener);

  const previousRefs = bus.sessionRefs.get(sessionName) ?? 0;
  bus.sessionRefs.set(sessionName, previousRefs + 1);

  if (previousRefs === 0) {
    // First subscriber for this session — make sure the WS exists and
    // announce the session.
    ensureConnected();
    send({ type: "subscribe", sessions: [sessionName] });
  } else {
    // Already subscribed at the wire level; just make sure the WS exists.
    ensureConnected();
  }
  // Cancel any pending idle close — we have a new subscriber.
  clearTimer("idleCloseTimer");

  return () => {
    const setForSession = bus.perSession.get(sessionName);
    if (setForSession) {
      setForSession.delete(listener);
      if (setForSession.size === 0) bus.perSession.delete(sessionName);
    }
    const refs = bus.sessionRefs.get(sessionName) ?? 0;
    if (refs <= 1) {
      bus.sessionRefs.delete(sessionName);
      send({ type: "unsubscribe", sessions: [sessionName] });
    } else {
      bus.sessionRefs.set(sessionName, refs - 1);
    }
    maybeScheduleIdleClose();
  };
}

/** Subscribe to every server frame regardless of session. Used by EventBridge. */
export function subscribeGlobal(listener: Listener): () => void {
  if (typeof WebSocket === "undefined") {
    return () => {
      /* no-op on SSR */
    };
  }
  bus.global.add(listener);
  ensureConnected();
  clearTimer("idleCloseTimer");
  return () => {
    bus.global.delete(listener);
    maybeScheduleIdleClose();
  };
}

export function getWsState(): WsState {
  return bus.state;
}

/**
 * Test-only escape hatch. Resets every piece of bus state so each test starts
 * with a clean slate. Exported separately to avoid being mistaken for a public
 * API by IDE auto-imports.
 */
export const __resetWsBusForTests = (): void => {
  if (bus.socket) {
    try {
      bus.socket.close();
    } catch {
      /* ignore */
    }
  }
  clearTimer("reconnectTimer");
  clearTimer("idleCloseTimer");
  bus.socket = null;
  bus.state = "closed";
  bus.backoff = INITIAL_BACKOFF_MS;
  bus.sessionRefs.clear();
  bus.perSession.clear();
  bus.global.clear();
};
