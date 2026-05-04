"use client";

import { motion, AnimatePresence } from "motion/react";
import { Activity } from "lucide-react";
import type { AgentDetail } from "@/lib/types";
import { EmptyState } from "@/components/ui";

interface AgentActivityRailProps {
  agents: AgentDetail[];
  onAgentClick?: (agent: AgentDetail) => void;
}

function statusColor(busy: boolean): string {
  return busy ? "var(--accent)" : "var(--dim)";
}

function statusLabel(busy: boolean): string {
  return busy ? "working" : "idle";
}

export function AgentActivityRail({ agents, onAgentClick }: AgentActivityRailProps) {
  // Sort: busy first; then by elapsed (recent activity)
  const sorted = [...agents].sort((a, b) => {
    if (a.isBusy !== b.isBusy) return a.isBusy ? -1 : 1;
    return a.paneTitle.localeCompare(b.paneTitle);
  });

  return (
    <section data-testid="mission-agent-rail" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">
          <Activity aria-hidden="true" size={12} strokeWidth={1.6} /> Agent activity
        </h2>
        <span className="text-[10px] tabular-nums text-[var(--dim)]">
          {sorted.filter((a) => a.isBusy).length} active
        </span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No agents online"
          body="Launch the workspace and connect agents to see live activity here."
          className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)]"
        />
      ) : (
        <ul className="m-0 list-none space-y-1 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] p-1">
          <AnimatePresence initial={false}>
            {sorted.map((agent, idx) => (
              <motion.li
                key={agent.paneId}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{
                  type: "spring",
                  stiffness: 600,
                  damping: 49,
                  delay: idx * 0.025,
                }}
                data-testid={`agent-row-${agent.paneId}`}
              >
                <button
                  type="button"
                  onClick={() => onAgentClick?.(agent)}
                  className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors hover-only:hover:bg-[var(--surface-hover)]"
                >
                  <span className="relative inline-flex h-2 w-2 shrink-0">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-full w-full rounded-full"
                      style={{ background: statusColor(agent.isBusy) }}
                    />
                    {agent.isBusy && (
                      <motion.span
                        aria-hidden="true"
                        initial={{ opacity: 0.6, scale: 1 }}
                        animate={{ opacity: 0, scale: 2.4 }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                        className="absolute inset-0 rounded-full"
                        style={{ background: statusColor(agent.isBusy) }}
                      />
                    )}
                  </span>
                  <span className="min-w-[12ch] shrink-0 truncate text-[12px] font-medium text-[var(--fg)]">
                    {agent.paneTitle}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--fg-secondary)]">
                    {agent.taskTitle ?? (
                      <span className="text-[var(--dim)]">— no current task</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                    {statusLabel(agent.isBusy)}
                  </span>
                  <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-[var(--dim)]">
                    {agent.elapsed || "-"}
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
