"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  RotateCcw,
  ShieldCheck,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { EmptyState } from "@/components/ui";
import type { EventData } from "@/lib/api";

interface EventStreamProps {
  events: EventData[];
  limit?: number;
  onShowAll?: () => void;
}

interface MinuteGroup {
  bucket: string;
  bucketLabel: string;
  events: EventData[];
}

const ICONS: Record<string, { Icon: ComponentType<{ size?: number; className?: string }>; color: string }> = {
  dispatch: { Icon: Send, color: "var(--accent)" },
  "task.dispatched": { Icon: Send, color: "var(--accent)" },
  completion: { Icon: CheckCircle2, color: "var(--green)" },
  "task.completed": { Icon: CheckCircle2, color: "var(--green)" },
  retry: { Icon: RotateCcw, color: "var(--yellow)" },
  "task.retried": { Icon: RotateCcw, color: "var(--yellow)" },
  "task.failed": { Icon: AlertTriangle, color: "var(--red)" },
  validation_dispatch: { Icon: ShieldCheck, color: "var(--cyan)" },
  validation_failed: { Icon: AlertTriangle, color: "var(--red)" },
  milestone_complete: { Icon: CheckCircle2, color: "var(--green)" },
  milestone_validating: { Icon: ShieldCheck, color: "var(--yellow)" },
  error: { Icon: AlertTriangle, color: "var(--red)" },
  reconcile: { Icon: ArrowRight, color: "var(--dim)" },
};

const DEFAULT_ICON = { Icon: CircleDot, color: "var(--dim)" };

function bucketKey(timestamp: string): { key: string; label: string } {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return { key: timestamp, label: timestamp };
  const isoMinute = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}T${d.getUTCHours()}:${d.getUTCMinutes()}`;
  const local = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return { key: isoMinute, label: local };
}

export function groupByMinute(events: EventData[]): MinuteGroup[] {
  const groups: MinuteGroup[] = [];
  let current: MinuteGroup | null = null;
  for (const event of events) {
    const { key, label } = bucketKey(event.timestamp);
    if (!current || current.bucket !== key) {
      current = { bucket: key, bucketLabel: label, events: [event] };
      groups.push(current);
    } else {
      current.events.push(event);
    }
  }
  return groups;
}

function EventRow({ event }: { event: EventData }) {
  const meta = ICONS[event.type] ?? DEFAULT_ICON;
  return (
    <li
      data-testid={`event-row-${event.type}`}
      className="flex items-center gap-3 rounded-sm px-2 py-1.5"
    >
      <meta.Icon size={12} className="shrink-0" />
      <span className="shrink-0 text-[10px] uppercase tracking-[0.08em]" style={{ color: meta.color }}>
        {event.type.replace(/^task\./, "")}
      </span>
      {event.agent && (
        <span className="shrink-0 text-[11px] text-[var(--fg-secondary)]">{event.agent}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--fg)]">
        {event.message}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-[var(--dim)]">
        {event.relative}
      </span>
    </li>
  );
}

export function EventStream({ events, limit = 20, onShowAll }: EventStreamProps) {
  const limited = useMemo(() => events.slice(0, limit), [events, limit]);
  const groups = useMemo(() => groupByMinute(limited), [limited]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(bucket: string) {
    setCollapsed((c) => {
      const current = c[bucket] ?? true; // default collapsed
      return { ...c, [bucket]: !current };
    });
  }

  return (
    <section data-testid="mission-event-stream" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">Activity</h2>
        {onShowAll && events.length > limit && (
          <button
            type="button"
            data-testid="event-stream-show-all"
            onClick={onShowAll}
            className="text-[10px] text-[var(--cyan)] hover-only:hover:underline"
          >
            Show all ({events.length})
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="No recent activity"
          body="Events from the orchestrator will appear here as agents work."
          className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)]"
        />
      ) : (
        <div className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)]">
          <ul className="m-0 list-none divide-y divide-[var(--border-weak)] p-0">
            {groups.map((group) => {
              const isCollapsed = group.events.length > 1 && collapsed[group.bucket] !== false;
              const showCollapse = group.events.length > 1;
              return (
                <li key={group.bucket} data-testid={`event-bucket-${group.bucket}`} className="px-2 py-1.5">
                  {showCollapse ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggle(group.bucket)}
                        data-testid={`event-bucket-toggle-${group.bucket}`}
                        className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left transition-colors hover-only:hover:bg-[var(--surface-hover)]"
                      >
                        {isCollapsed ? (
                          <ChevronRight aria-hidden="true" size={12} className="text-[var(--dim)]" />
                        ) : (
                          <ChevronDown aria-hidden="true" size={12} className="text-[var(--dim)]" />
                        )}
                        <span className="text-[10px] tabular-nums text-[var(--dim)]">
                          {group.bucketLabel}
                        </span>
                        <span className="text-[11px] text-[var(--fg-secondary)]">
                          {group.events.length} events
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 600, damping: 49 }}
                            className="overflow-hidden"
                          >
                            <ul className="m-0 mt-1 list-none space-y-0.5 p-0 pl-4">
                              {group.events.map((e, i) => (
                                <EventRow key={`${e.timestamp}-${e.type}-${i}`} event={e} />
                              ))}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {group.events.map((e, i) => (
                        <EventRow key={`${e.timestamp}-${e.type}-${i}`} event={e} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
