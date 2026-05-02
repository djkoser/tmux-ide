"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchMilestones, type MilestoneData } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { StatusPopover } from "./StatusPopover";
import { projectNameFromPath } from "./projectPath";

function milestoneColor(status: MilestoneData["status"]): string {
  if (status === "done") return "var(--green)";
  if (status === "active") return "var(--accent)";
  if (status === "validating") return "var(--yellow)";
  return "var(--dim)";
}

function percent(milestone: MilestoneData): number {
  return milestone.taskCount > 0
    ? Math.round((milestone.tasksDone / milestone.taskCount) * 100)
    : 0;
}

export function MilestonesSegment() {
  const pathname = usePathname();
  const project = projectNameFromPath(pathname);
  const [open, setOpen] = useState(false);
  const fetcher = useCallback(
    () => (project ? fetchMilestones(project) : Promise.resolve([])),
    [project],
  );
  const { data } = usePolling<MilestoneData[]>(fetcher, 3000);

  if (!project || !data) return null;

  const active = data.find((milestone) => milestone.status === "active");
  const label = active
    ? `${active.id} · ${active.tasksDone}/${active.taskCount}`
    : "no active milestone";

  return (
    <>
      <span className="mx-2 opacity-30">│</span>
      <span className="relative inline-flex items-center">
        <button
          type="button"
          data-testid="status-segment-milestones"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex items-center gap-1.5 text-left transition-colors hover:text-[var(--fg)] ${
            active ? "text-[var(--dim)]" : "text-[var(--dim)] opacity-70"
          }`}
        >
          {active && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: milestoneColor(active.status) }}
            />
          )}
          <span>{label}</span>
        </button>
        <StatusPopover open={open} onClose={() => setOpen(false)}>
          <div className="space-y-2">
            <div className="text-[var(--accent)]">milestones</div>
            {data.length === 0 ? (
              <div className="text-[var(--dim)]">no milestones</div>
            ) : (
              <div className="space-y-2">
                {data.map((milestone) => (
                  <div key={milestone.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="min-w-0 truncate">
                        <span style={{ color: milestoneColor(milestone.status) }}>
                          {milestone.id}
                        </span>{" "}
                        {milestone.title}
                      </span>
                      <span className="shrink-0 text-[var(--dim)]">
                        {milestone.tasksDone}/{milestone.taskCount}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden bg-[var(--border)]">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{ width: `${percent(milestone)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-[var(--dim)]">{milestone.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </StatusPopover>
      </span>
    </>
  );
}
