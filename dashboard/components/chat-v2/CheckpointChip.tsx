/**
 * Inline chip rendered above a Turn header showing the turn's checkpoint
 * status. Clicking opens a popover with the changed-files list and a
 * "Revert to this checkpoint" button.
 *
 * The revert API call lives in dashboard/lib/api.ts; this component just
 * surfaces the affordance and emits the request through the supplied
 * callback. Engine semantics (dirty-tree refusal etc.) come from T073.
 */

import { useState } from "react";
import type { CheckpointSummaryView } from "./useChatStore";

export interface CheckpointChipProps {
  checkpoint: CheckpointSummaryView;
  onRevert?: (checkpointRef: string) => void;
}

const STATUS_LABEL: Record<CheckpointSummaryView["status"], string> = {
  ready: "checkpoint",
  missing: "checkpoint missing",
  error: "checkpoint error",
};

const STATUS_COLOR: Record<CheckpointSummaryView["status"], string> = {
  ready: "var(--green)",
  missing: "var(--yellow)",
  error: "var(--red)",
};

export function CheckpointChip({ checkpoint, onRevert }: CheckpointChipProps) {
  const [open, setOpen] = useState(false);
  const fileCount = checkpoint.files.length;

  return (
    <div data-testid="checkpoint-chip" className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="checkpoint-chip-trigger"
        className="inline-flex items-center gap-1 rounded border border-[var(--border-weak)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--fg-soft)] hover:bg-[var(--surface-hover)]"
        style={{ borderColor: STATUS_COLOR[checkpoint.status] }}
      >
        <span aria-hidden style={{ color: STATUS_COLOR[checkpoint.status] }}>
          ●
        </span>
        <span>{STATUS_LABEL[checkpoint.status]}</span>
        <span className="text-[var(--dim)]">
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
      </button>
      {open ? (
        <div
          data-testid="checkpoint-chip-menu"
          className="absolute left-0 z-10 mt-1 w-72 rounded border border-[var(--border)] bg-[var(--bg-strong)] p-2 text-[11px] shadow-lg"
        >
          <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--dim)]">
            checkpoint {checkpoint.checkpointRef.slice(0, 8)}
          </div>
          {fileCount === 0 ? (
            <div className="text-[var(--dim)]">— no file changes —</div>
          ) : (
            <ul data-testid="checkpoint-chip-files" className="max-h-48 overflow-y-auto">
              {checkpoint.files.map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate text-[var(--fg-soft)]">{f.path}</span>
                  <span className="text-[10px] text-[var(--dim)]">
                    <span className="text-[var(--green)]">+{f.additions}</span>{" "}
                    <span className="text-[var(--red)]">-{f.deletions}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            data-testid="checkpoint-chip-revert"
            disabled={checkpoint.status !== "ready" || !onRevert}
            onClick={() => {
              setOpen(false);
              onRevert?.(checkpoint.checkpointRef);
            }}
            className="mt-2 w-full rounded border border-[var(--border-weak)] bg-[var(--surface)] py-1 text-[11px] text-[var(--fg)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revert to this checkpoint
          </button>
        </div>
      ) : null}
    </div>
  );
}
