"use client";

import { useState, useEffect } from "react";
import {
  aggregateWorkspaces,
  type WorkspaceEntry,
  type WorkspaceProjectDetail,
  type WorkspaceSummary,
} from "@/lib/api";
import type { Task } from "@/lib/types";

const COLUMNS: { status: Task["status"]; label: string; color: string }[] = [
  { status: "todo", label: "todo", color: "var(--dim)" },
  { status: "in-progress", label: "doing", color: "var(--yellow)" },
  { status: "review", label: "review", color: "var(--magenta)" },
  { status: "done", label: "done", color: "var(--green)" },
];

/**
 * Federated multi-workspace view (VAL-019). Reads the registry from the local
 * daemon, then aggregates each workspace's own daemon API client-side. A dead
 * workspace renders offline — it never blocks or errors the others.
 */
export function FederationView() {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const results = await aggregateWorkspaces();
      if (!cancelled) {
        setSummaries(results);
        setLoaded(true);
      }
    }

    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (loaded && summaries.length === 0) {
    return (
      <div className="flex-1 p-4 text-[var(--dim)]">
        no registered workspaces (~/.tmux-ide/workspaces.json)
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-auto space-y-3">
      {summaries.map(({ ws, online, detail }) => (
        <WorkspaceSwimlane key={ws.name} ws={ws} online={online} detail={detail} />
      ))}
    </div>
  );
}

function WorkspaceSwimlane({
  ws,
  online,
  detail,
}: {
  ws: WorkspaceEntry;
  online: boolean;
  detail: WorkspaceProjectDetail | null;
}) {
  const milestones = detail?.milestones ?? [];
  const doneMs = milestones.filter((m) => m.status === "done").length;
  const val = detail?.validationSummary;

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-[var(--border)]">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: online ? "var(--green)" : "var(--red)" }}
          title={online ? "online" : "offline"}
        />
        <span className="text-[var(--fg)] font-medium">{ws.name}</span>
        <span className="text-[var(--dim)] text-[11px]">:{ws.ports.commandCenter}</span>
        {!online && <span className="text-[var(--red)] text-[11px]">offline</span>}
        {online && detail?.mission && (
          <span className="text-[var(--dim)] text-[11px] truncate">— {detail.mission.title}</span>
        )}
      </div>

      {online && detail ? (
        <div className="flex flex-wrap items-center gap-4 px-3 py-2 text-[12px]">
          <div className="flex items-center gap-2">
            {COLUMNS.map((col) => {
              const n = detail.tasks.filter((t) => t.status === col.status).length;
              return (
                <span key={col.status} style={{ color: col.color }}>
                  {col.label} {n}
                </span>
              );
            })}
          </div>
          <span className="text-[var(--dim)]">
            milestones {doneMs}/{milestones.length}
          </span>
          {val && (
            <span className="text-[var(--dim)]">
              assertions <span style={{ color: "var(--green)" }}>{val.passing}</span>
              {val.failing > 0 && <span style={{ color: "var(--red)" }}> ·{val.failing}✗</span>}/
              {val.total}
            </span>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 text-[var(--dim)] text-[12px]">
          {online ? "no mission data" : "daemon not responding"}
        </div>
      )}
    </div>
  );
}
