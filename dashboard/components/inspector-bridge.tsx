"use client";

/**
 * React → Solid bridge for the right-rail Inspector widget. Pane 1's
 * shell refactor lands the actual mount point; this bridge is a
 * standalone consumer the shell can drop in once the slot exists.
 *
 * Sourcing:
 *   - Events: subscribed via the WebSocket bus (event.appended frames).
 *     Initial load + reconnects fall back to a one-shot fetchEvents().
 *     Polling is intentionally avoided — the bus already retries the WS
 *     and replays a snapshot frame on reconnect, so the rail's data is
 *     never staler than the rest of the dashboard.
 *   - Scope: passed in as the `currentView` prop. The shell wires it
 *     from its router / view selector.
 *   - Expanded: controlled by the host. The bridge does not write
 *     localStorage — that's the shell's responsibility.
 *
 * ADR-0001 §1.4 Rule 4: this is the one *Bridge file allowed to call
 * mount() for the Inspector widget.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  InspectorMountHandle,
  InspectorMountOptions,
  InspectorScope,
} from "@tmux-ide/v2-solid-widgets";
import { fetchEvents, type EventData } from "@/lib/api";
import { subscribeSession, type ServerFrame } from "@/lib/wsBus";

interface InspectorBridgeProps {
  /**
   * Project / session name. Falsy disables sourcing (the widget renders
   * its empty state) so the shell can mount the bridge before a project
   * is selected.
   */
  projectName: string | null;
  /** Coarse view tag the user is looking at. Falsy collapses to "all". */
  currentView?: InspectorScope;
  /** Controlled expanded state. Bridge propagates without persistence. */
  expanded?: boolean;
  onToggleExpanded?: (next: boolean) => void;
  /**
   * Hide `agent_heartbeat` and other low-signal events. Defaults to true
   * — the right rail is too narrow to absorb heartbeat noise.
   */
  hideHeartbeats?: boolean;
}

const MAX_EVENTS = 200;

export function InspectorBridge({
  projectName,
  currentView,
  expanded,
  onToggleExpanded,
  hideHeartbeats = true,
}: InspectorBridgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<InspectorMountHandle | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);

  // Initial fetch + WS subscription per project.
  useEffect(() => {
    if (!projectName) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    fetchEvents(projectName)
      .then((next) => {
        if (!cancelled) setEvents(next.slice(0, MAX_EVENTS));
      })
      .catch(() => {
        // Empty stream is the fallback — the widget renders its own
        // "no events in scope" placeholder.
      });

    const release = subscribeSession(projectName, (frame: ServerFrame) => {
      if (frame.type === "event.appended") {
        setEvents((prev) => {
          // Newest-first, capped. Dedup by `${timestamp}:${type}` to avoid
          // double-render if the WS replays an event we already have.
          const key = `${frame.event.timestamp}:${frame.event.type}:${frame.event.taskId ?? ""}`;
          const exists = prev.some(
            (e) => `${e.timestamp}:${e.type}:${e.taskId ?? ""}` === key,
          );
          if (exists) return prev;
          return [frame.event, ...prev].slice(0, MAX_EVENTS);
        });
        return;
      }
      // Full snapshot frames carry an events[] — refresh wholesale so the
      // rail catches up after a reconnect without polling.
      if (frame.type === "snapshot") {
        const next = frame.data.events ?? [];
        setEvents(next.slice(0, MAX_EVENTS));
      }
    });

    return () => {
      cancelled = true;
      release();
    };
  }, [projectName]);

  const mountOptions = useMemo<InspectorMountOptions>(
    () => ({
      events,
      hideHeartbeats,
      currentView,
      ...(typeof expanded === "boolean" ? { expanded } : {}),
      onToggleExpanded,
    }),
    [events, hideHeartbeats, currentView, expanded, onToggleExpanded],
  );

  // Mount-once on container ready, then forward updates via setOptions
  // so a prop change doesn't tear down the Solid runtime.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountInspector(el, mountOptions);
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // Mount once; updates flow via setOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setOptions(mountOptions);
  }, [mountOptions]);

  return (
    <div
      ref={containerRef}
      data-testid="inspector-bridge"
      data-project-name={projectName ?? ""}
      style={{ display: "flex", flex: "1 1 0%", minHeight: 0, minWidth: 0, width: "100%" }}
    />
  );
}
