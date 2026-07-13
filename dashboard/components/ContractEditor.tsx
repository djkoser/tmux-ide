"use client";

import { useState, useEffect } from "react";
import { fetchContract, saveContract } from "@/lib/api";

interface ContractEditorProps {
  sessionName: string;
  onSaved: () => void;
}

/**
 * Edit the validation-contract markdown text. Assertion *status* is set from the
 * per-assertion AssertionControl, not here. Saving that drops an assertion a task
 * still claims is rejected server-side (I5); the claimants are shown.
 */
export function ContractEditor({ sessionName, onSaved }: ContractEditorProps) {
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) void fetchContract(sessionName).then(setContent);
  }, [sessionName, editing]);

  async function handleSave() {
    setSaving(true);
    setError("");
    const r = await saveContract(sessionName, content);
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      onSaved();
    } else if (r.stillClaimed) {
      const detail = Object.entries(r.stillClaimed)
        .map(([a, tasks]) => `${a} (tasks ${tasks.join(", ")})`)
        .join("; ");
      setError(`${r.error}: ${detail}`);
    } else {
      setError(r.error ?? "save failed");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h3 className="text-[var(--accent)]">contract</h3>
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
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
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-2 py-0.5 text-[11px] text-[var(--dim)] border border-[var(--border)] hover:border-[var(--dim)]"
          >
            edit
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] text-[12px] font-mono px-2 py-1 outline-none focus:border-[var(--accent)] resize-y"
        />
      ) : (
        <pre className="text-[var(--fg)] text-[12px] whitespace-pre-wrap bg-[var(--surface)] p-2 border border-[var(--border)]">
          {content || "no contract yet"}
        </pre>
      )}

      {error && <div className="text-[var(--red)] text-[11px]">{error}</div>}
    </div>
  );
}
