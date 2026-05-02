"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchProject } from "@/lib/api";
import type { ProjectDetail } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";
import { StatusPopover } from "./StatusPopover";
import { projectNameFromPath } from "./projectPath";

export function AgentsSegment() {
  const pathname = usePathname();
  const project = projectNameFromPath(pathname);
  const [open, setOpen] = useState(false);
  const fetcher = useCallback(
    () => (project ? fetchProject(project) : Promise.resolve(null)),
    [project],
  );
  const { data } = usePolling<ProjectDetail | null>(fetcher, 2000);

  if (!project || !data || data.agents.length === 0) return null;

  const busy = data.agents.filter((agent) => agent.isBusy).length;

  return (
    <>
      <span className="mx-2 opacity-30">│</span>
      <span className="relative inline-flex items-center">
        <button
          type="button"
          data-testid="status-segment-agents"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 text-left text-[var(--dim)] transition-colors hover:text-[var(--fg)]"
        >
          <span className="text-[var(--green)]">{busy}</span>
          <span>/{data.agents.length} agents</span>
        </button>
        <StatusPopover open={open} onClose={() => setOpen(false)}>
          <div className="space-y-2">
            <div className="text-[var(--accent)]">agents</div>
            <div className="space-y-1.5">
              {data.agents.map((agent) => (
                <div
                  key={agent.paneId}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: agent.isBusy ? "var(--green)" : "var(--dim)" }}
                  />
                  <span className="min-w-0 truncate">
                    <span className="text-[var(--fg)]">{agent.paneTitle}</span>
                    {agent.taskTitle && (
                      <span className="text-[var(--dim)]"> · {agent.taskTitle}</span>
                    )}
                  </span>
                  <span className="text-[var(--dim)]">{agent.elapsed}</span>
                </div>
              ))}
            </div>
          </div>
        </StatusPopover>
      </span>
    </>
  );
}
