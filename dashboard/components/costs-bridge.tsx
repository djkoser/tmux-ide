"use client";

/**
 * React → Solid bridge for the Costs dashboard widget.
 *
 * Mirrors MissionControlBridge: the React host polls /api/project/:name/
 * metrics every 5s via usePolling + fetchMetrics, normalizes into the
 * framework-agnostic CostsDashboardSnapshot shape, and pushes through
 * `setOptions({ snapshot })` on every tick. Solid's fine-grained
 * reactivity rerenders only the affected KPI / agent / timeline rows.
 *
 * ADR-0001 §1.4 Rule 4: the one *Bridge file allowed to call mount()
 * for the Costs dashboard widget.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { fetchMetrics, type MetricsData } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";

interface CostsBridgeProps {
  sessionName: string;
}

// Match @tmux-ide/v2-solid-widgets's exported types structurally without
// a compile-time import (the package is dynamically imported below).
interface BridgeSnapshot {
  session: { startedAt: string | null; durationMs: number; status: string; agentCount: number };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    retried: number;
    completionRate: number;
    retryRate: number;
    avgDurationMs: number;
    medianDurationMs: number;
    p90DurationMs: number;
    byMilestone: Array<{
      id: string;
      title: string;
      status: string;
      taskCount: number;
      completedCount: number;
      durationMs: number;
    }>;
  };
  agents: Array<{
    name: string;
    totalTimeMs: number;
    activeTimeMs: number;
    idleTimeMs: number;
    taskCount: number;
    retryCount: number;
    utilization: number;
    specialties: string[];
  }>;
  mission: {
    title: string | null;
    status: string | null;
    milestonesCompleted: number;
    validationPassRate: number;
    wallClockMs: number;
  };
  timeline: Array<{
    timestamp: string;
    completedTasks: number;
    activeTasks: number;
    busyAgents: number;
    idleAgents: number;
  }>;
}

type CostsDashboardMountHandle = {
  unmount(): void;
  setOptions(next: {
    snapshot?: BridgeSnapshot | null;
    timelineLimit?: number;
  }): void;
};

function normalize(data: MetricsData | null): BridgeSnapshot | null {
  if (!data) return null;
  // Shape is already compatible — the bridge interface mirrors MetricsData
  // 1:1. The cast lets the runtime carry through without rebuilding.
  return data as unknown as BridgeSnapshot;
}

export function CostsBridge({ sessionName }: CostsBridgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CostsDashboardMountHandle | null>(null);
  const fetcher = useCallback(() => fetchMetrics(sessionName), [sessionName]);
  const { data } = usePolling<MetricsData | null>(fetcher, 5000);
  const snapshot = useMemo(() => normalize(data), [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountCostsDashboard(el, {
        snapshot,
        timelineLimit: 20,
      });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // Mount once; snapshot updates flow through setOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setOptions({ snapshot });
  }, [snapshot]);

  return (
    <div
      ref={containerRef}
      data-testid="costs-bridge"
      data-session-name={sessionName}
      style={{ display: "flex", flex: "1 1 0%", minHeight: 0, minWidth: 0, width: "100%" }}
    />
  );
}
