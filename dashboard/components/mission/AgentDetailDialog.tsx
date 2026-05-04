"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  StatusPill,
} from "@/components/ui";
import type { AgentDetail } from "@/lib/types";

interface AgentDetailDialogProps {
  agent: AgentDetail | null;
  onOpenChange: (open: boolean) => void;
}

export function AgentDetailDialog({ agent, onOpenChange }: AgentDetailDialogProps) {
  return (
    <Dialog open={agent !== null} onOpenChange={onOpenChange}>
      <DialogContent
        side="right"
        data-testid="agent-detail-dialog"
        className="w-[min(420px,calc(100vw-32px))] p-5"
      >
        {agent && (
          <>
            <DialogHeader>
              <DialogTitle>{agent.paneTitle}</DialogTitle>
              <DialogDescription>Pane {agent.paneId}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <StatusPill
                  variant={agent.isBusy ? "active" : "pending"}
                  label={agent.isBusy ? "working" : "idle"}
                />
                <span className="text-[11px] tabular-nums text-[var(--dim)]">
                  elapsed {agent.elapsed || "-"}
                </span>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                  Current task
                </div>
                <div
                  data-testid="agent-detail-task"
                  className="mt-1 rounded-md border border-[var(--border-weak)] bg-[var(--bg)] p-3 text-[12px] text-[var(--fg)]"
                >
                  {agent.taskTitle ? (
                    <div className="space-y-1">
                      <div className="font-medium">{agent.taskTitle}</div>
                      {agent.taskId && (
                        <div className="font-mono text-[10px] text-[var(--dim)]">
                          {agent.taskId}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--dim)]">No active task</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                  Recent activity
                </div>
                <div className="mt-1 rounded-md border border-[var(--border-weak)] bg-[var(--bg)] p-3 text-[11px] text-[var(--fg-secondary)]">
                  Open the terminal pane to view live agent output. Token usage and tool calls will
                  appear here once metrics are wired through the SSE stream.
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
