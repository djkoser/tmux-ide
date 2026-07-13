"use client";

import { useState } from "react";
import { assertValidation, type AssertionStatus } from "@/lib/api";

const STATUS_OPTIONS: AssertionStatus[] = ["pending", "passing", "failing", "blocked"];

const STATUS_COLORS: Record<AssertionStatus, string> = {
  passing: "var(--green)",
  failing: "var(--red)",
  pending: "var(--dim)",
  blocked: "var(--yellow)",
};

interface AssertionControlProps {
  sessionName: string;
  assertionId: string;
  status: AssertionStatus;
  verifiedBy: string | null;
  evidence: string | null;
  onChanged: () => void;
}

/**
 * Per-assertion status control for the validation tab. Flips an assertion's
 * status + evidence through the shared daemon assert path (same write as the
 * `validate assert` CLI). Evidence is required for passing/failing — enforced
 * both here (save disabled) and server-side (400). Edits open on demand so the
 * tab's 3s polling never clobbers an in-progress change.
 */
export function AssertionControl({
  sessionName,
  assertionId,
  status,
  verifiedBy,
  evidence,
  onChanged,
}: AssertionControlProps) {
  const [editing, setEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<AssertionStatus>(status);
  const [draftEvidence, setDraftEvidence] = useState(evidence ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsEvidence = draftStatus === "passing" || draftStatus === "failing";
  const evidenceMissing = needsEvidence && draftEvidence.trim().length === 0;

  function startEditing() {
    setDraftStatus(status);
    setDraftEvidence(evidence ?? "");
    setError("");
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const r = await assertValidation(sessionName, assertionId, {
      status: draftStatus,
      evidence: draftEvidence.trim() || undefined,
    });
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      onChanged();
    } else {
      setError(r.error ?? "save failed");
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-0.5 bg-[var(--surface)]">
        <span className="text-[var(--fg)] w-32 shrink-0">{assertionId}</span>
        <span style={{ color: STATUS_COLORS[status] ?? "var(--dim)" }} className="w-16 shrink-0">
          {status}
        </span>
        {verifiedBy && <span className="text-[var(--cyan)] text-[11px]">@{verifiedBy}</span>}
        {evidence && (
          <span className="text-[var(--dim)] text-[11px] truncate flex-1">{evidence}</span>
        )}
        <button
          type="button"
          onClick={startEditing}
          className="ml-auto px-2 py-0.5 text-[11px] text-[var(--dim)] border border-[var(--border)] hover:border-[var(--dim)] shrink-0"
        >
          edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-[var(--surface)] border border-[var(--accent)]">
      <div className="flex items-center gap-2">
        <span className="text-[var(--fg)] w-32 shrink-0">{assertionId}</span>
        <select
          value={draftStatus}
          onChange={(e) => setDraftStatus(e.target.value as AssertionStatus)}
          className="bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] text-[12px] px-1 py-0.5 outline-none focus:border-[var(--accent)]"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex gap-2 ml-auto shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || evidenceMissing}
            className="px-2 py-0.5 text-[11px] text-[var(--bg)] bg-[var(--accent)] hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "saving…" : "save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError("");
            }}
            className="px-2 py-0.5 text-[11px] text-[var(--dim)] border border-[var(--border)]"
          >
            cancel
          </button>
        </div>
      </div>
      <input
        type="text"
        value={draftEvidence}
        onChange={(e) => setDraftEvidence(e.target.value)}
        placeholder={needsEvidence ? "evidence (required)" : "evidence (optional)"}
        className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] text-[12px] font-mono px-2 py-0.5 outline-none focus:border-[var(--accent)]"
      />
      {evidenceMissing && (
        <div className="text-[var(--yellow)] text-[11px]">
          evidence is required to mark {draftStatus}
        </div>
      )}
      {error && <div className="text-[var(--red)] text-[11px]">{error}</div>}
    </div>
  );
}
