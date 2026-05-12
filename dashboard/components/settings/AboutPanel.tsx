"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionHeader, SurfaceCard } from "@/components/ui";

type UpdateStatus =
  | "idle"
  | "checking"
  | "update-available"
  | "no-update"
  | "update-downloaded"
  | "error";

interface UpdateStatusPayload {
  status: UpdateStatus;
  message?: string;
}

interface UpdateRuntime {
  version?: string;
  checkForUpdates?: () => Promise<void>;
  onUpdateStatus?: (handler: (payload: UpdateStatusPayload) => void) => () => void;
}

function updateRuntime(): UpdateRuntime | null {
  if (typeof window === "undefined") return null;
  return (window.__TMUX_IDE__ as UpdateRuntime | undefined) ?? null;
}

const statusLabel: Record<UpdateStatus, string> = {
  idle: "Idle",
  checking: "Checking",
  "update-available": "Update available",
  "no-update": "No update available",
  "update-downloaded": "Update downloaded",
  error: "Update check failed",
};

export function AboutPanel() {
  const runtime = useMemo(() => updateRuntime(), []);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const canCheckForUpdates = typeof runtime?.checkForUpdates === "function";
  const version = runtime?.version ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  useEffect(() => {
    if (!runtime?.onUpdateStatus) return undefined;
    return runtime.onUpdateStatus((payload) => {
      setStatus(payload.status);
      setMessage(payload.message ?? null);
    });
  }, [runtime]);

  async function handleCheckForUpdates() {
    if (!runtime?.checkForUpdates) return;
    setStatus("checking");
    setMessage(null);
    try {
      await runtime.checkForUpdates();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section data-testid="settings-section-about" className="max-w-3xl">
      <SectionHeader label="About" />
      <SurfaceCard className="mt-3 space-y-4">
        <div className="space-y-1 text-[12px] text-[var(--fg-secondary)]">
          <div data-testid="about-version">tmux-ide {version}</div>
          <div>Build date: {process.env.NEXT_PUBLIC_BUILD_DATE ?? "local"}</div>
          <a
            className="block text-[var(--cyan)] hover:underline"
            href="https://github.com/wavyrai/tmux-ide"
          >
            GitHub repository
          </a>
          <a
            className="block text-[var(--cyan)] hover:underline"
            href="https://github.com/wavyrai/tmux-ide/tree/main/docs"
          >
            Documentation
          </a>
        </div>

        <div className="border-t border-[var(--border-weak)] pt-3">
          <div className="mb-2 text-[12px] text-[var(--fg)]">Updates</div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="about-check-updates"
              disabled={!canCheckForUpdates || status === "checking"}
              onClick={handleCheckForUpdates}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check for updates
            </button>
            <span
              data-testid="about-update-status"
              className="text-[12px] text-[var(--fg-secondary)]"
            >
              {statusLabel[status]}
            </span>
          </div>
          {message && (
            <div data-testid="about-update-message" className="mt-2 text-[11px] text-[var(--dim)]">
              {message}
            </div>
          )}
        </div>
      </SurfaceCard>
    </section>
  );
}
