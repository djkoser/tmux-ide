"use client";

/**
 * React → Solid bridge for the Activity timeline widget.
 *
 * Subscribes to useSessionStream (WebSocket bus) for live events,
 * normalizes the dashboard's EventData shape into the
 * framework-agnostic ActivityEvent (drops nothing — the shapes are
 * structurally compatible), and pushes through `setOptions({ events })`
 * on every WS-driven snapshot update. Solid's fine-grained reactivity
 * means appending a new event re-renders only the new row, not the
 * entire timeline.
 *
 * ADR-0001 §1.4 Rule 4: the one *Bridge file allowed to call mount()
 * for the Activity widget.
 */

import { useEffect, useMemo, useRef } from "react";
import { useSessionStream } from "@/lib/useSessionStream";
import type { EventData } from "@/lib/api";

interface ActivityBridgeProps {
  sessionName: string;
  /** Hide agent_heartbeat noise. Defaults to true (matches React view). */
  hideHeartbeats?: boolean;
}

// Structural shape of the widget's mount handle (kept in sync with
// @tmux-ide/v2-solid-widgets's ActivityMountHandle without importing it
// at compile time — the package is dynamically imported below).
type ActivityMountHandle = {
  unmount(): void;
  setOptions(next: {
    events?: ReadonlyArray<{
      timestamp: string;
      type: string;
      message: string;
      agent?: string | null;
      taskId?: string;
      relative?: string;
    }>;
    hideHeartbeats?: boolean;
  }): void;
};

function normalize(events: ReadonlyArray<EventData> | undefined): ReadonlyArray<{
  timestamp: string;
  type: string;
  message: string;
  agent?: string | null;
  taskId?: string;
  relative?: string;
}> {
  if (!events) return [];
  return events.map((e) => ({
    timestamp: e.timestamp,
    type: e.type,
    message: e.message,
    agent: e.agent ?? null,
    taskId: e.taskId,
    relative: e.relative,
  }));
}

export function ActivityBridge({ sessionName, hideHeartbeats = true }: ActivityBridgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<ActivityMountHandle | null>(null);
  const { snapshot } = useSessionStream(sessionName);
  const events = useMemo(() => normalize(snapshot?.events), [snapshot?.events]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountActivity(el, { events, hideHeartbeats });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // Mount once; updates flow through setOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setOptions({ events, hideHeartbeats });
  }, [events, hideHeartbeats]);

  return (
    <div
      ref={containerRef}
      data-testid="activity-bridge"
      data-session-name={sessionName}
      style={{ display: "flex", flex: "1 1 0%", minHeight: 0, minWidth: 0, width: "100%" }}
    />
  );
}
