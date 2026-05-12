"use client";

import { useEffect, useState } from "react";
import {
  fetchEvents,
  fetchMilestones,
  fetchMission,
  fetchProject,
  fetchSkills,
  type EventData,
} from "@/lib/api";
import { subscribeSession, type ServerFrame, type SessionSnapshot } from "@/lib/wsBus";

export type { SessionSnapshot } from "@/lib/wsBus";

interface StreamState {
  snapshot: SessionSnapshot | null;
  lastEventAt: number;
  connected: boolean;
}

const INITIAL_STATE: StreamState = {
  snapshot: null,
  lastEventAt: 0,
  connected: false,
};

async function fetchSnapshot(sessionName: string): Promise<SessionSnapshot> {
  const [project, mission, milestones, skills, events] = await Promise.all([
    fetchProject(sessionName),
    fetchMission(sessionName),
    fetchMilestones(sessionName),
    fetchSkills(sessionName),
    fetchEvents(sessionName),
  ]);

  return {
    project,
    mission,
    milestones: Array.isArray(milestones) ? milestones : [],
    goals: project?.goals ?? [],
    tasks: project?.tasks ?? [],
    skills: Array.isArray(skills) ? skills : [],
    agents: project?.agents ?? [],
    events: Array.isArray(events) ? events : [],
  };
}

function normalizeSnapshot(payload: Partial<SessionSnapshot>): SessionSnapshot {
  const project = payload.project ?? null;
  return {
    project,
    mission: payload.mission ?? null,
    milestones: payload.milestones ?? [],
    goals: payload.goals ?? project?.goals ?? [],
    tasks: payload.tasks ?? project?.tasks ?? [],
    skills: payload.skills ?? [],
    agents: payload.agents ?? project?.agents ?? [],
    events: (payload.events ?? []).map(relativeEvent),
  };
}

function relativeEvent(event: EventData): EventData {
  if (event.relative) return event;
  const ms = Date.now() - new Date(event.timestamp).getTime();
  let relative = "now";
  if (Number.isFinite(ms)) {
    if (ms < 60_000) relative = `${Math.max(0, Math.floor(ms / 1000))}s ago`;
    else if (ms < 3_600_000) relative = `${Math.floor(ms / 60_000)}m ago`;
    else if (ms < 86_400_000) relative = `${Math.floor(ms / 3_600_000)}h ago`;
    else relative = `${Math.floor(ms / 86_400_000)}d ago`;
  }
  return { ...event, relative };
}

/**
 * Per-session shared subscription on top of the WebSocket bus.
 *
 * One bus subscription per session, regardless of how many components in the
 * tree call `useSessionStream(name)`. Each call adds a subscriber to the
 * shared channel and listens to its broadcast state. The last unsubscribe
 * releases the bus subscription. The bus itself runs over a single shared
 * WebSocket so this avoids the per-origin HTTP/1.1 connection limit (6
 * streams) that previously froze the dashboard when AppSidebar + KanbanView +
 * MissionView + StatusBar + ActivityView each opened their own SSE.
 */
interface Channel {
  state: StreamState;
  release: (() => void) | null;
  subscribers: Set<(s: StreamState) => void>;
  refetching: boolean;
}

const channels = new Map<string, Channel>();

function setChannelState(
  channel: Channel,
  next: StreamState | ((prev: StreamState) => StreamState),
) {
  const resolved = typeof next === "function" ? next(channel.state) : next;
  if (resolved === channel.state) return;
  channel.state = resolved;
  for (const listener of channel.subscribers) listener(resolved);
}

async function refreshChannelSnapshot(channel: Channel, sessionName: string): Promise<void> {
  if (channel.refetching) return;
  channel.refetching = true;
  try {
    const snapshot = await fetchSnapshot(sessionName);
    setChannelState(channel, (current) => ({ ...current, snapshot, lastEventAt: Date.now() }));
  } catch {
    // Keep current snapshot; the bus retries the WS independently.
  } finally {
    channel.refetching = false;
  }
}

function handleFrame(channel: Channel, sessionName: string, frame: ServerFrame): void {
  switch (frame.type) {
    case "snapshot": {
      // Mark as connected on first frame received. The bus has no per-session
      // open/close semantics — receiving a frame proves the channel is live.
      setChannelState(channel, {
        snapshot: normalizeSnapshot(frame.data),
        connected: true,
        lastEventAt: Date.now(),
      });
      return;
    }
    case "task.changed":
    case "mission.changed":
    case "goal.changed":
    case "milestone.changed":
    case "agent.changed": {
      setChannelState(channel, (current) => ({
        ...current,
        connected: true,
        lastEventAt: Date.now(),
      }));
      void refreshChannelSnapshot(channel, sessionName);
      return;
    }
    case "event.appended": {
      setChannelState(channel, (current) => {
        const snapshot = current.snapshot;
        if (!snapshot) return { ...current, connected: true, lastEventAt: Date.now() };
        const nextEvent = relativeEvent(frame.event);
        const seen = new Set(
          snapshot.events.map((item) => `${item.timestamp}:${item.type}:${item.taskId ?? ""}`),
        );
        const key = `${nextEvent.timestamp}:${nextEvent.type}:${nextEvent.taskId ?? ""}`;
        if (seen.has(key)) {
          return { ...current, connected: true, lastEventAt: Date.now() };
        }
        return {
          ...current,
          connected: true,
          lastEventAt: Date.now(),
          snapshot: {
            ...snapshot,
            events: [nextEvent, ...snapshot.events].slice(0, 200),
          },
        };
      });
      return;
    }
    default:
      // Other frame types ("hello", "sessions.changed", "pong") are not
      // session-scoped and never arrive through `subscribeSession`.
      return;
  }
}

function acquireChannel(sessionName: string, listener: (s: StreamState) => void): () => void {
  let channel = channels.get(sessionName);
  if (!channel) {
    const created: Channel = {
      state: INITIAL_STATE,
      release: null,
      subscribers: new Set(),
      refetching: false,
    };
    channels.set(sessionName, created);
    // Kick off an initial REST fetch so consumers get data even before the
    // server pushes a snapshot frame. The bus will deliver pushes as they
    // arrive and refresh the snapshot on `*.changed` frames.
    void refreshChannelSnapshot(created, sessionName);
    created.release = subscribeSession(sessionName, (frame) =>
      handleFrame(created, sessionName, frame),
    );
    channel = created;
  }
  channel.subscribers.add(listener);
  // Push current state immediately so late subscribers don't render INITIAL.
  listener(channel.state);
  return () => {
    const ch = channels.get(sessionName);
    if (!ch) return;
    ch.subscribers.delete(listener);
    if (ch.subscribers.size === 0) {
      ch.release?.();
      ch.release = null;
      channels.delete(sessionName);
    }
  };
}

export function useSessionStream(sessionName: string | null): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);

  useEffect(() => {
    if (!sessionName) {
      setState(INITIAL_STATE);
      return;
    }
    const release = acquireChannel(sessionName, (next) => setState(next));
    return () => {
      release();
      setState(INITIAL_STATE);
    };
  }, [sessionName]);

  return state;
}
