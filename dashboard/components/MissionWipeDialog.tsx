"use client";

import { useState, useEffect, useRef } from "react";
import { stopAndWipeMission } from "@/lib/api";

interface MissionWipeDialogProps {
  sessionName: string;
  missionTitle: string;
  onClose: () => void;
  onWiped: () => void;
}

/**
 * Destructive mission kill-switch confirm. Requires typing the mission name
 * (rm-my-repo pattern) before the wipe enables. On confirm the server stands the
 * team down, wipes the tracker, and bounces the daemon — so the console briefly
 * disconnects and auto-reconnects (handled by the page's polling).
 */
export function MissionWipeDialog({
  sessionName,
  missionTitle,
  onClose,
  onWiped,
}: MissionWipeDialogProps) {
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

  const matches = typed === missionTitle;

  async function handleWipe() {
    if (!matches) return;
    setBusy(true);
    setError("");
    const r = await stopAndWipeMission(sessionName, typed);
    setBusy(false);
    if (r.ok) onWiped();
    else setError(r.error ?? "wipe failed");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--modal-overlay)]" onClick={onClose} />
      <div className="relative bg-[var(--bg)] border border-[var(--red)] w-full max-w-md">
        <div className="flex items-center justify-between px-4 h-8 bg-[var(--surface)] border-b border-[var(--red)]">
          <span className="text-[var(--red)]">stop &amp; wipe mission</span>
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
            This permanently erases the mission&apos;s tasks, milestones, and validation state, and
            stands every agent down. It cannot be undone.
          </div>
          <div className="text-[var(--dim)]">
            The wipe bounces the daemon, so this console will disconnect and reconnect for a moment
            — that is expected, not an error.
          </div>
          <div>
            <div className="text-[var(--dim)] text-[10px] uppercase tracking-wider mb-1">
              type the mission name to confirm
            </div>
            <div className="text-[var(--dim)] mb-1 font-mono text-[11px]">{missionTitle}</div>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={missionTitle}
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
              onClick={handleWipe}
              disabled={!matches || busy}
              className="px-3 py-1 text-[var(--bg)] bg-[var(--red)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {busy ? "wiping…" : "stop & wipe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
