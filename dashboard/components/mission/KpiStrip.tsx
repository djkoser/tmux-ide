"use client";

import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { KpiCard } from "@/components/ui";
import { formatDuration } from "./utils";

function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v: number) => (format ? format(v) : Math.round(v).toString()));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const ctl = animate(mv, value, { duration: 0.45, ease: [0.32, 0.72, 0, 1] });
    return () => ctl.stop();
  }, [value, mv, reduce]);
  return <motion.span>{display}</motion.span>;
}

export interface MissionKpis {
  agentsActive: number;
  agentsTotal: number;
  tasksDone: number;
  tasksTotal: number;
  runtimeMs: number;
  estimatedCompletion: string | null;
}

interface KpiStripProps {
  kpis: MissionKpis;
  onAgentsClick?: () => void;
}

function fmtCount(n: number, total: number): ReactNode {
  return (
    <span className="inline-flex items-baseline gap-1">
      <AnimatedNumber value={n} />
      <span className="text-[12px] text-[var(--dim)]">/ {total}</span>
    </span>
  );
}

export function KpiStrip({ kpis, onAgentsClick }: KpiStripProps) {
  return (
    <section
      data-testid="mission-kpi-strip"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      <KpiCard
        label="Active agents"
        testId="kpi-agents"
        value={fmtCount(kpis.agentsActive, kpis.agentsTotal)}
        color="var(--accent)"
        onClick={onAgentsClick}
      />
      <KpiCard
        label="Tasks done"
        testId="kpi-tasks"
        value={fmtCount(kpis.tasksDone, kpis.tasksTotal)}
        color="var(--green)"
      />
      <KpiCard
        label="Runtime"
        testId="kpi-runtime"
        value={<AnimatedNumber value={kpis.runtimeMs} format={formatDuration} />}
      />
      <KpiCard
        label="Est. completion"
        testId="kpi-eta"
        value={kpis.estimatedCompletion ?? "-"}
        color={kpis.estimatedCompletion ? "var(--cyan)" : undefined}
      />
    </section>
  );
}
