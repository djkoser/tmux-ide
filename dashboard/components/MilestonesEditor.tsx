"use client";

import { useState } from "react";
import {
  createMilestone,
  updateMilestone,
  insertMilestone,
  type MilestoneData,
} from "@/lib/api";

interface MilestonesEditorProps {
  sessionName: string;
  milestones: MilestoneData[];
  onChanged: () => void;
}

const STATUSES: MilestoneData["status"][] = ["locked", "active", "validating", "done"];

export function MilestonesEditor({ sessionName, milestones, onChanged }: MilestonesEditorProps) {
  const [newTitle, setNewTitle] = useState("");
  const [insertTitle, setInsertTitle] = useState("");
  const [insertPos, setInsertPos] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ordered = [...milestones].sort((a, b) => a.order - b.order);

  async function run(op: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    const r = await op();
    setBusy(false);
    if (r.ok) onChanged();
    else setError(r.error ?? "failed");
  }

  const inputClass =
    "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] px-2 py-1 outline-none focus:border-[var(--accent)] placeholder:text-[var(--dim)]";

  return (
    <div className="space-y-2">
      <h3 className="text-[var(--accent)]">milestones</h3>

      <div className="space-y-px">
        {ordered.map((m) => (
          <div key={m.id} className="flex items-center gap-2 px-2 py-1 bg-[var(--surface)]">
            <span className="text-[var(--dim)] w-8 shrink-0">{m.id}</span>
            <input
              type="text"
              defaultValue={m.title}
              onBlur={(e) => {
                if (e.target.value !== m.title)
                  void run(() => updateMilestone(sessionName, m.id, { title: e.target.value }));
              }}
              className={`${inputClass} flex-1`}
            />
            <select
              value={m.status}
              onChange={(e) =>
                void run(() =>
                  updateMilestone(sessionName, m.id, {
                    status: e.target.value as MilestoneData["status"],
                  }),
                )
              }
              className={inputClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ))}
        {ordered.length === 0 && (
          <div className="text-[var(--dim)] text-[11px]">no milestones yet</div>
        )}
      </div>

      {/* Append */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="new milestone title"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          disabled={busy || !newTitle.trim()}
          onClick={() =>
            void run(() =>
              createMilestone(sessionName, {
                title: newTitle.trim(),
                sequence: ordered.length + 1,
              }),
            ).then(() => setNewTitle(""))
          }
          className="px-3 py-1 text-[var(--bg)] bg-[var(--accent)] hover:opacity-90 disabled:opacity-50"
        >
          add
        </button>
      </div>

      {/* Insert at position (renumbers the rest 1..N) */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={insertTitle}
          onChange={(e) => setInsertTitle(e.target.value)}
          placeholder="insert title"
          className={`${inputClass} flex-1`}
        />
        <input
          type="number"
          min={1}
          max={ordered.length + 1}
          value={insertPos}
          onChange={(e) => setInsertPos(Number(e.target.value))}
          className={`${inputClass} w-16`}
          aria-label="position"
        />
        <button
          type="button"
          disabled={busy || !insertTitle.trim()}
          onClick={() =>
            void run(() =>
              insertMilestone(sessionName, { title: insertTitle.trim(), position: insertPos }),
            ).then(() => setInsertTitle(""))
          }
          className="px-3 py-1 text-[var(--fg)] border border-[var(--border)] hover:border-[var(--dim)] disabled:opacity-50"
        >
          insert
        </button>
      </div>

      {error && <div className="text-[var(--red)] text-[11px]">{error}</div>}
    </div>
  );
}
