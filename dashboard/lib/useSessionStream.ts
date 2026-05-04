"use client";

import { useEffect, useState } from "react";
import {
  API_BASE,
  fetchEvents,
  fetchMilestones,
  fetchMission,
  fetchProject,
  fetchSkills,
  type EventData,
  type MilestoneData,
  type MissionDetail,
  type SkillData,
} from "@/lib/api";
import type { AgentDetail, Goal, ProjectDetail, Task } from "@/lib/types";

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

function parseEvent<T>(event: MessageEvent<string>): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
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
 * Per-session shared subscription.
 *
 * One EventSource per session, regardless of how many components in the tree
 * call `useSessionStream(name)`. Each call adds a subscriber to the shared
 * channel and listens to its broadcast state. The last unsubscribe closes
 * the underlying connection. This avoids exhausting the browser's per-origin
 * HTTP/1.1 connection limit (6 streams) when a single project page mounts
 * AppSidebar + KanbanView + MissionView + StatusBar + ActivityView, all
 * each previously opening their own SSE.
 */
interface Channel {
  state: StreamState;
  source: EventSource | null;
  reconnect: ReturnType<typeof setTimeout> | null;
  backoff: number;
  closed: boolean;
  subscribers: Set<(s: StreamState) => void>;
  refetching: boolean;
}

const channels = new Map<string, Channel>();

function setChannelState(channel: Channel, next: StreamState | ((prev: StreamState) => StreamState)) {
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
    // Keep current snapshot; reconnect path retries independently.
  } finally {
    channel.refetching = false;
  }
}

function connectChannel(channel: Channel, sessionName: string): void {
  if (channel.closed) return;
  if (typeof EventSource === "undefined") return;
  const source = new EventSource(
    `${API_BASE}/api/project/${encodeURIComponent(sessionName)}/stream`,
  );
  channel.source = source;

  source.onopen = () => {
    channel.backoff = 1000;
    setChannelState(channel, (current) => ({
      ...current,
      connected: true,
      lastEventAt: Date.now(),
    }));
  };

  source.addEventListener("snapshot", (event) => {
    const payload = parseEvent<Partial<SessionSnapshot>>(event as MessageEvent<string>);
    if (!payload) return;
    setChannelState(channel, {
      snapshot: normalizeSnapshot(payload),
      connected: true,
      lastEventAt: Date.now(),
    });
  });

  for (const eventName of [
    "task.changed",
    "mission.changed",
    "goal.changed",
    "milestone.changed",
    "agent.changed",
  ]) {
    source.addEventListener(eventName, () => void refreshChannelSnapshot(channel, sessionName));
  }

  source.addEventListener("event.appended", (event) => {
    const payload = parseEvent<EventData>(event as MessageEvent<string>);
    if (!payload) return;
    setChannelState(channel, (current) => {
      const snapshot = current.snapshot;
      if (!snapshot) return { ...current, lastEventAt: Date.now() };
      const nextEvent = relativeEvent(payload);
      const seen = new Set(
        snapshot.events.map((item) => `${item.timestamp}:${item.type}:${item.taskId ?? ""}`),
      );
      const key = `${nextEvent.timestamp}:${nextEvent.type}:${nextEvent.taskId ?? ""}`;
      if (seen.has(key)) return { ...current, lastEventAt: Date.now() };
      return {
        ...current,
        lastEventAt: Date.now(),
        snapshot: {
          ...snapshot,
          events: [nextEvent, ...snapshot.events].slice(0, 200),
        },
      };
    });
  });

  source.addEventListener("ping", () => {
    setChannelState(channel, (current) => ({
      ...current,
      connected: true,
      lastEventAt: Date.now(),
    }));
  });

  source.onerror = () => {
    source.close();
    if (channel.source !== source) return;
    channel.source = null;
    setChannelState(channel, (current) => ({ ...current, connected: false }));
    if (channel.closed) return;
    const delay = channel.backoff;
    channel.backoff = Math.min(delay * 2, 30_000);
    channel.reconnect = setTimeout(() => connectChannel(channel, sessionName), delay);
  };
}

function teardownChannel(channel: Channel): void {
  channel.closed = true;
  if (channel.reconnect) {
    clearTimeout(channel.reconnect);
    channel.reconnect = null;
  }
  channel.source?.close();
  channel.source = null;
}

function acquireChannel(sessionName: string, listener: (s: StreamState) => void): () => void {
  let channel = channels.get(sessionName);
  if (!channel) {
    channel = {
      state: INITIAL_STATE,
      source: null,
      reconnect: null,
      backoff: 1000,
      closed: false,
      subscribers: new Set(),
      refetching: false,
    };
    channels.set(sessionName, channel);
    void refreshChannelSnapshot(channel, sessionName);
    connectChannel(channel, sessionName);
  }
  channel.subscribers.add(listener);
  // Push current state immediately so late subscribers don't render INITIAL.
  listener(channel.state);
  return () => {
    const ch = channels.get(sessionName);
    if (!ch) return;
    ch.subscribers.delete(listener);
    if (ch.subscribers.size === 0) {
      teardownChannel(ch);
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
