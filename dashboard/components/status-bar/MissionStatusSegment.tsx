"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchMission, type MissionDetail } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { StatusPopover } from "./StatusPopover";
import { projectNameFromPath } from "./projectPath";

function statusColor(status: string): string {
  if (status === "complete") return "var(--green)";
  if (status === "active") return "var(--accent)";
  return "var(--yellow)";
}

function validationText(summary: MissionDetail["validationSummary"]): string {
  if (summary.total === 0) return "no assertions";
  const failing = summary.failing > 0 ? `, ${summary.failing} failing` : "";
  return `${summary.passing}/${summary.total} passing${failing}`;
}

export function MissionStatusSegment() {
  const pathname = usePathname();
  const project = projectNameFromPath(pathname);
  const [open, setOpen] = useState(false);
  const fetcher = useCallback(
    () => (project ? fetchMission(project) : Promise.resolve(null)),
    [project],
  );
  const { data } = usePolling<MissionDetail | null>(fetcher, 5000);

  if (!project || !data) return null;

  const label = `${data.mission.title} - ${data.mission.status}`;

  return (
    <>
      <span className="mx-2 opacity-30">│</span>
      <span className="relative inline-flex min-w-0 items-center">
        <button
          type="button"
          data-testid="status-segment-mission"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex max-w-64 items-center gap-1.5 truncate text-left text-[var(--dim)] transition-colors hover:text-[var(--fg)]"
          title={label}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusColor(data.mission.status) }}
          />
          <span className="truncate">{label}</span>
        </button>
        <StatusPopover open={open} onClose={() => setOpen(false)}>
          <div className="space-y-2">
            <div>
              <div className="text-[var(--accent)]">{data.mission.title}</div>
              <div className="mt-1 max-w-sm whitespace-pre-wrap text-[var(--dim)]">
                {data.mission.description || "no description"}
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="text-[var(--dim)]">status</span>
              <span style={{ color: statusColor(data.mission.status) }}>{data.mission.status}</span>
              <span className="text-[var(--dim)]">validation</span>
              <span>{validationText(data.validationSummary)}</span>
              {data.mission.branch && (
                <>
                  <span className="text-[var(--dim)]">branch</span>
                  <span className="truncate">{data.mission.branch}</span>
                </>
              )}
            </div>
          </div>
        </StatusPopover>
      </span>
    </>
  );
}
