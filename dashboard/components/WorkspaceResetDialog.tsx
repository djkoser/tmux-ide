"use client";

import { useState, useEffect, useRef } from "react";
import { resetWorkspace } from "@/lib/api";

interface WorkspaceResetDialogProps {
  sessionName: string;
  onClose: () => void;
  onReset: () => void;
}

/**
 * Destructive workspace kill-switch confirm. Requires typing the directory
 * name (rm-my-repo pattern) before the reset enables. On confirm the server
 * wipes the tracker (mission, tasks, milestones, validation, plans, claim
 * lock) and stops the directory's tmux session + daemon — so this console
 * page goes away with it.
 */
export function WorkspaceResetDialog({ sessionName, onClose, onReset }: WorkspaceResetDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = typed === sessionName;

  async function handleReset() {
    if (!matches) return;
    setBusy(true);
    setError("");
    const r = await resetWorkspace(sessionName, typed);
    setBusy(false);
    if (r.ok) onReset();
    else setError(r.error ?? "reset failed");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--modal-overlay)]" onClick={onClose} />
      <div className="relative bg-[var(--bg)] border border-[var(--red)] w-full max-w-md">
        <div className="flex items-center justify-between px-4 h-8 bg-[var(--surface)] border-b border-[var(--red)]">
          <span className="text-[var(--red)]">reset workspace &amp; stop session</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--dim)] hover:text-[var(--fg)] transition-colors"
          >
            esc ×
          </button>
        </div>

        <div className="p-4 space-y-3 text-[12px]">
          <div className="text-[var(--fg)]">
            This permanently erases the workspace&apos;s mission, tasks, milestones, validation
            state, and plans, then kills the tmux session and its daemon. Every agent pane dies
            with the session. It cannot be undone.
          </div>
          <div className="text-[var(--dim)]">
            The directory disappears from the console until you launch it again with{" "}
            <span className="text-[var(--accent)]">tmux-ide</span>.
          </div>
          <div>
            <div className="text-[var(--dim)] text-[10px] uppercase tracking-wider mb-1">
              type the directory name to confirm
            </div>
            <div className="text-[var(--dim)] mb-1 font-mono text-[11px]">{sessionName}</div>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={sessionName}
              className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] px-2 py-1 outline-none focus:border-[var(--red)] placeholder:text-[var(--dim)]"
            />
          </div>

          {error && <div className="text-[var(--red)] text-[11px]">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-[var(--dim)] border border-[var(--border)] hover:border-[var(--dim)] transition-colors"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!matches || busy}
              className="px-3 py-1 text-[var(--bg)] bg-[var(--red)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {busy ? "resetting…" : "reset & stop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
