/**
 * Unified push channel for the dashboard — single WebSocket carrying
 * task / mission / milestone / goal / agent / event-log changes for one
 * or more sessions, replacing a fan of SSE streams.
 *
 * Endpoint: `/ws/events` (mounted by the daemon's HTTP server).
 *
 * Wire protocol: see `src/schemas/ws-events.ts`.
 */

import type { RawData, WebSocket } from "ws";
import {
  discoverSessions,
  buildOverviews,
  buildProjectDetail,
} from "./discovery.ts";
import {
  taskStore,
  loadMission,
  loadTasks,
  type TaskStoreChangeEvent,
} from "../lib/task-store.ts";
import {
  readEvents,
  eventLogEmitter,
  type OrchestratorEvent,
} from "../lib/event-log.ts";
import { loadValidationState } from "../lib/validation.ts";
import { loadSkills } from "../lib/skill-registry.ts";
import type { ServerFrame, ClientFrame } from "../schemas/ws-events.ts";

const WS_OPEN = 1;
const KEEPALIVE_INTERVAL_MS = 25_000;
const SESSIONS_POLL_MS = 2_000;

interface WsLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: RawData | string, isBinary: boolean) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  off?(event: string, listener: (...args: unknown[]) => void): this;
  removeListener?(event: string, listener: (...args: unknown[]) => void): this;
}

interface SessionListener {
  taskListener: (change: TaskStoreChangeEvent) => void;
  eventListener: (message: { dir: string; event: OrchestratorEvent }) => void;
}

// Module-level globals for the "sessions.changed" broadcaster, shared by all
// connected clients. The poller is started lazily on the first connection
// and stopped when the last client disconnects.
const allClients = new Set<{ broadcastSessionsChanged: () => void }>();
let sessionsPollTimer: ReturnType<typeof setInterval> | null = null;
let lastSessionsHash = "";

function snapshotSessionsHash(): string {
  try {
    return JSON.stringify(discoverSessions().map((s) => s.name).sort());
  } catch {
    return "";
  }
}

function ensureSessionsPoller(): void {
  if (sessionsPollTimer) return;
  lastSessionsHash = snapshotSessionsHash();
  sessionsPollTimer = setInterval(() => {
    const hash = snapshotSessionsHash();
    if (hash === lastSessionsHash) return;
    lastSessionsHash = hash;
    for (const client of allClients) client.broadcastSessionsChanged();
  }, SESSIONS_POLL_MS);
  sessionsPollTimer.unref?.();
}

function maybeStopSessionsPoller(): void {
  if (allClients.size > 0 || !sessionsPollTimer) return;
  clearInterval(sessionsPollTimer);
  sessionsPollTimer = null;
}

function rawDataToText(data: RawData | string): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data as Uint8Array).toString("utf8");
}

function isPathInside(path: string | null | undefined, root: string): boolean {
  if (!path) return false;
  return path === root || path.startsWith(root + "/");
}

function classifyTaskStorePath(
  change: TaskStoreChangeEvent,
  sessionDir: string,
): "task" | "mission" | "goal" | "milestone" | null {
  const path = change.path;
  if (!path) return null;
  if (!isPathInside(path, sessionDir)) return null;
  // Schema name is the most reliable signal when available.
  if (change.schemaName === "task") return "task";
  if (change.schemaName === "goal") return "goal";
  if (change.schemaName === "mission") return "mission";
  // Path-based fallback. mission.json contains milestones, so treat
  // mission writes as both mission and milestone changes — the dashboard
  // is happy to receive both.
  if (path.includes("/.tasks/tasks/")) return "task";
  if (path.includes("/.tasks/goals/")) return "goal";
  if (path.endsWith("/.tasks/mission.json")) return "mission";
  return null;
}

/**
 * Build the snapshot payload pushed to a client when they subscribe to a
 * session. Mirrors `buildProjectStreamSnapshot` in server.ts so the SSE and
 * WS channels stay observationally equivalent during the migration.
 */
export function buildSessionSnapshot(sessionName: string): unknown | null {
  const session = discoverSessions().find((s) => s.name === sessionName);
  if (!session) return null;

  const project = buildProjectDetail(session);
  const mission = loadMission(session.dir);
  const tasks = loadTasks(session.dir);
  const milestones = mission
    ? [...mission.milestones]
        .sort((a, b) => a.order - b.order)
        .map((milestone) => {
          const milestoneTasks = tasks.filter((t) => t.milestone === milestone.id);
          return {
            ...milestone,
            taskCount: milestoneTasks.length,
            tasksDone: milestoneTasks.filter((t) => t.status === "done").length,
          };
        })
    : [];

  const valState = loadValidationState(session.dir);
  const assertions = valState ? Object.values(valState.assertions) : [];
  const validationSummary = {
    total: assertions.length,
    passing: assertions.filter((a) => a.status === "passing").length,
    failing: assertions.filter((a) => a.status === "failing").length,
    pending: assertions.filter((a) => a.status === "pending").length,
    blocked: assertions.filter((a) => a.status === "blocked").length,
  };

  return {
    project,
    mission: mission ? { mission, validationSummary } : null,
    milestones,
    goals: project.goals,
    tasks: project.tasks,
    skills: loadSkills(session.dir),
    agents: project.agents,
    events: readEvents(session.dir).slice(-100).reverse(),
  };
}

/**
 * Wire a single WebSocket connection. Tracks per-session subscriptions,
 * forwards `taskStore` and `eventLogEmitter` events to the client (filtered
 * by subscription), and tears all listeners down on close — no leaks.
 */
export function handleWsEventsConnection(socket: WebSocket | WsLike): void {
  const ws = socket as WsLike;
  // sessionName → listener pair on taskStore + eventLogEmitter
  const subscriptions = new Map<string, SessionListener>();
  // sessionName → resolved dir at subscribe time. Used to filter
  // path-scoped change events.
  const sessionDirs = new Map<string, string>();
  let closed = false;

  const send = (frame: ServerFrame): void => {
    if (closed || ws.readyState !== WS_OPEN) return;
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // peer went away mid-send; close path will clean up
    }
  };

  const broadcastSessionsChanged = (): void => {
    send({ type: "sessions.changed" });
  };

  // Track this client globally for "sessions.changed" broadcasts.
  const clientHandle = { broadcastSessionsChanged };
  allClients.add(clientHandle);
  ensureSessionsPoller();

  // Server-initiated keepalive — mirrors the SSE behavior so middle-boxes
  // don't reap the connection.
  const keepalive = setInterval(() => {
    send({ type: "pong" });
  }, KEEPALIVE_INTERVAL_MS);
  keepalive.unref?.();

  const subscribe = (sessionName: string): void => {
    if (subscriptions.has(sessionName)) return;

    const session = discoverSessions().find((s) => s.name === sessionName);
    const dir = session?.dir ?? null;
    if (dir) sessionDirs.set(sessionName, dir);

    const taskListener = (change: TaskStoreChangeEvent): void => {
      const knownDir = sessionDirs.get(sessionName);
      if (!knownDir) return;
      const kind = classifyTaskStorePath(change, knownDir);
      if (!kind) return;
      // mission.json drives milestones too — emit both.
      if (kind === "mission") {
        send({ type: "mission.changed", sessionName });
        send({ type: "milestone.changed", sessionName });
        return;
      }
      if (kind === "task") send({ type: "task.changed", sessionName });
      else if (kind === "goal") send({ type: "goal.changed", sessionName });
      else if (kind === "milestone") send({ type: "milestone.changed", sessionName });
    };

    const eventListener = (message: { dir: string; event: OrchestratorEvent }): void => {
      const knownDir = sessionDirs.get(sessionName);
      if (!knownDir || message.dir !== knownDir) return;
      send({ type: "event.appended", sessionName, event: message.event });
    };

    taskStore.on("change", taskListener);
    eventLogEmitter.on("event", eventListener);
    subscriptions.set(sessionName, { taskListener, eventListener });

    // Push initial snapshot so the dashboard doesn't have to poll on connect.
    if (session) {
      const data = buildSessionSnapshot(sessionName);
      if (data) {
        send({
          type: "snapshot",
          sessionName,
          data: data as Record<string, unknown>,
        });
      }
    }
  };

  const unsubscribe = (sessionName: string): void => {
    const entry = subscriptions.get(sessionName);
    if (!entry) return;
    taskStore.off("change", entry.taskListener);
    eventLogEmitter.off("event", entry.eventListener);
    subscriptions.delete(sessionName);
    sessionDirs.delete(sessionName);
  };

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(keepalive);
    allClients.delete(clientHandle);
    for (const [name, entry] of subscriptions) {
      taskStore.off("change", entry.taskListener);
      eventLogEmitter.off("event", entry.eventListener);
      sessionDirs.delete(name);
    }
    subscriptions.clear();
    maybeStopSessionsPoller();
  };

  ws.on("message", (data) => {
    if (closed) return;
    let parsed: ClientFrame | null = null;
    try {
      const obj = JSON.parse(rawDataToText(data));
      if (obj && typeof obj === "object" && typeof (obj as { type?: unknown }).type === "string") {
        parsed = obj as ClientFrame;
      }
    } catch {
      return; // ignore non-JSON / malformed frames
    }
    if (!parsed) return;

    if (parsed.type === "subscribe") {
      for (const name of parsed.sessions) subscribe(name);
      return;
    }
    if (parsed.type === "unsubscribe") {
      for (const name of parsed.sessions) unsubscribe(name);
      return;
    }
    if (parsed.type === "ping") {
      send({ type: "pong" });
      return;
    }
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);

  // Send the initial hello — caller knows which sessions exist without
  // a separate REST round-trip.
  try {
    const sessions = discoverSessions();
    send({ type: "hello", sessions: buildOverviews(sessions) });
  } catch {
    send({ type: "hello", sessions: [] });
  }
}

/**
 * Test-only hook to shut down the global sessions poller. The handler also
 * stops it automatically when the last client disconnects, but tests that
 * never connect a client may need to assert no timer leak.
 */
export function _stopSessionsPollerForTests(): void {
  if (!sessionsPollTimer) return;
  clearInterval(sessionsPollTimer);
  sessionsPollTimer = null;
}
