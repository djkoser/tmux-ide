"use client";

import { useMemo, useState } from "react";
// Eye, EyeOff kept: no entries in supplied glyph map.
import { Eye, EyeOff } from "lucide-react";
import { dispatch } from "@/lib/actionClient";
import { SectionHeader, SurfaceCard } from "@/components/ui";

type RemoteAccessState = {
  enabled: boolean;
  url: string | null;
  token: string | null;
  qrPayload: string | null;
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`h-5 w-9 rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <span
        className={`block h-4 w-4 rounded-md bg-[var(--bg)] transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function QrCode({ payload }: { payload: string }) {
  const cells = useMemo(() => {
    const size = 25;
    const matrix: boolean[][] = [];
    let seed = hashString(payload);
    for (let y = 0; y < size; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x += 1) {
        const inFinder = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        if (inFinder) {
          const fx = x < 7 ? x : x - (size - 7);
          const fy = y < 7 ? y : y - (size - 7);
          row.push(
            fx === 0 ||
              fy === 0 ||
              fx === 6 ||
              fy === 6 ||
              (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4),
          );
          continue;
        }
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        row.push((seed & 3) === 0);
      }
      matrix.push(row);
    }
    return matrix;
  }, [payload]);

  return (
    <div
      aria-label="Remote access QR code"
      className="grid h-40 w-40 grid-cols-[repeat(25,1fr)] rounded-md border border-[var(--border)] bg-white p-2"
    >
      {cells.flatMap((row, y) =>
        row.map((filled, x) => (
          <span key={`${x}-${y}`} className={filled ? "bg-black" : "bg-white"} aria-hidden="true" />
        )),
      )}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      title={label}
      onClick={() => void navigator.clipboard?.writeText(value)}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>⎘</span>
    </button>
  );
}

export function RemoteAccessPanel() {
  const [state, setState] = useState<RemoteAccessState>({
    enabled: false,
    url: null,
    token: null,
    qrPayload: null,
  });
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setEnabled(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await dispatch("app.setRemoteAccess", { enabled });
      setState(result);
      if (!enabled) setShowToken(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const maskedToken = state.token ? "•".repeat(Math.min(32, state.token.length)) : "";

  return (
    <section data-testid="settings-section-remote" className="max-w-3xl">
      <SectionHeader label="Remote access" />
      <SurfaceCard className="mt-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--border-weak)] py-3">
          <div className="min-w-0">
            <div className="text-[13px] text-[var(--fg)]">Remote access</div>
            <div className="mt-0.5 text-[11px] text-[var(--dim)]">
              Bind the daemon to your network with bearer-token protection.
            </div>
          </div>
          <Toggle checked={state.enabled} disabled={busy} onChange={setEnabled} />
        </div>

        {error && <div className="py-3 text-[11px] text-[var(--red)]">{error}</div>}

        {state.enabled && state.url && state.token && state.qrPayload && (
          <div className="space-y-3 py-3 text-[12px]">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="mb-1 text-[11px] text-[var(--dim)]">URL</div>
                <code className="block truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] text-[var(--fg)]">
                  {state.url}
                </code>
              </div>
              <CopyButton value={state.url} label="Copy remote URL" />
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <div className="mb-1 text-[11px] text-[var(--dim)]">Bearer token</div>
                <code className="block truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] text-[var(--fg)]">
                  {showToken ? state.token : maskedToken}
                </code>
              </div>
              <button
                type="button"
                title={showToken ? "Hide token" : "Show token"}
                onClick={() => setShowToken((value) => !value)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <CopyButton value={state.token} label="Copy bearer token" />
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <QrCode payload={state.qrPayload} />
              <div className="max-w-sm text-[11px] leading-5 text-[var(--yellow)]">
                Anyone on your network with this token can access your tmux-ide. Disable when not in
                use.
              </div>
            </div>
          </div>
        )}
      </SurfaceCard>
    </section>
  );
}
