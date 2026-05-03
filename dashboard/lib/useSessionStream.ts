"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function useSessionStream(sessionName: string | null): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const refetchingRef = useRef(false);
  const closedRef = useRef(false);

  const refreshSnapshot = useCallback(async () => {
    if (!sessionName || refetchingRef.current) return;
    refetchingRef.current = true;
    try {
      const snapshot = await fetchSnapshot(sessionName);
      setState((current) => ({ ...current, snapshot, lastEventAt: Date.now() }));
    } catch {
      // Keep the current snapshot; the EventSource reconnect path will retry independently.
    } finally {
      refetchingRef.current = false;
    }
  }, [sessionName]);

  useEffect(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    closedRef.current = false;
    backoffRef.current = 1000;
    setState(INITIAL_STATE);

    if (!sessionName) return;
    void refreshSnapshot();
    if (typeof EventSource === "undefined") return;

    function connect() {
      if (closedRef.current || !sessionName) return;
      const source = new EventSource(
        `${API_BASE}/api/project/${encodeURIComponent(sessionName)}/stream`,
      );
      sourceRef.current = source;

      source.onopen = () => {
        backoffRef.current = 1000;
        setState((current) => ({ ...current, connected: true, lastEventAt: Date.now() }));
      };

      source.addEventListener("snapshot", (event) => {
        const payload = parseEvent<Partial<SessionSnapshot>>(event as MessageEvent<string>);
        if (!payload) return;
        setState({
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
        source.addEventListener(eventName, () => void refreshSnapshot());
      }

      source.addEventListener("event.appended", (event) => {
        const payload = parseEvent<EventData>(event as MessageEvent<string>);
        if (!payload) return;
        setState((current) => {
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
        setState((current) => ({ ...current, connected: true, lastEventAt: Date.now() }));
      });

      source.onerror = () => {
        source.close();
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        setState((current) => ({ ...current, connected: false }));
        if (closedRef.current) return;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 30_000);
        reconnectRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      closedRef.current = true;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [refreshSnapshot, sessionName]);

  return state;
}
