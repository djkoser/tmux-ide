"use client";

/**
 * T079 — Providers settings panel.
 *
 * Lets the user add / remove ProviderInstance rows that back chat
 * sessions. Persistence is to the daemon's `~/.tmux-ide/providers.json`
 * via a REST API (when T080 wires it); for now we round-trip through
 * `localStorage` under a stable key so the panel is functional in the
 * browser without backend coupling.
 *
 * Schema mirrors @tmux-ide/contracts/chat-thread ProviderInstance. We
 * keep the parse boundary here so a malformed localStorage payload
 * doesn't crash the dashboard.
 */

import { useEffect, useMemo, useState } from "react";

type ProviderKind =
  | "anthropic"
  | "openai"
  | "local-ollama"
  | "local-lmstudio"
  | "generic-acp";

interface ProviderInstance {
  id: string;
  kind: ProviderKind;
  displayName: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const STORAGE_KEY = "tmux-ide.providers.v1";

const KIND_LABELS: Record<ProviderKind, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "local-ollama": "Ollama (local)",
  "local-lmstudio": "LM Studio (local)",
  "generic-acp": "Generic ACP",
};

function readStored(): ProviderInstance[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProviderInstance);
  } catch {
    return [];
  }
}

function isProviderInstance(value: unknown): value is ProviderInstance {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.displayName === "string" &&
    typeof v.kind === "string" &&
    KIND_LABELS[v.kind as ProviderKind] !== undefined
  );
}

function writeStored(rows: ProviderInstance[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Best-effort persistence — localStorage quota or disabled storage
    // shouldn't crash the panel.
  }
}

export interface ProvidersPanelProps {
  /** Test seam — inject a starting set of rows. */
  initialProviders?: ProviderInstance[];
  onChange?: (rows: ProviderInstance[]) => void;
}

export function ProvidersPanel({ initialProviders, onChange }: ProvidersPanelProps) {
  const [rows, setRows] = useState<ProviderInstance[]>(() => initialProviders ?? readStored());
  const [draft, setDraft] = useState<ProviderInstance>(() => makeEmptyDraft());

  useEffect(() => {
    writeStored(rows);
    onChange?.(rows);
  }, [rows, onChange]);

  const draftValid = useMemo(() => isDraftValid(draft), [draft]);

  function add() {
    if (!draftValid) return;
    if (rows.some((r) => r.id === draft.id)) return;
    setRows((prev) => [...prev, draft]);
    setDraft(makeEmptyDraft());
  }

  function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div data-testid="providers-panel" className="flex flex-col gap-3">
      <h3 className="text-[11px] uppercase tracking-wider text-[var(--dim)]">Providers</h3>

      <ul data-testid="providers-list" className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <li data-testid="providers-empty" className="text-[11px] text-[var(--dim)]">
            — no providers configured —
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              data-testid="providers-row"
              data-provider-id={r.id}
              className="flex items-center justify-between rounded border border-[var(--border-weak)] bg-[var(--surface)] px-3 py-1.5 text-[11px]"
            >
              <div className="flex flex-col">
                <span className="text-[var(--fg)]">{r.displayName}</span>
                <span className="text-[10px] text-[var(--dim)]">
                  {KIND_LABELS[r.kind]} · {r.model ?? "no model"}
                </span>
              </div>
              <button
                type="button"
                data-testid="providers-remove"
                onClick={() => remove(r.id)}
                className="rounded border border-[var(--border-weak)] px-2 py-0.5 text-[10px] text-[var(--fg-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--red)]"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>

      <div
        data-testid="providers-draft"
        className="flex flex-col gap-1 rounded border border-[var(--border-weak)] bg-[var(--surface)] p-2"
      >
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          <input
            data-testid="providers-draft-id"
            placeholder="id (alphanumeric)"
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            className="rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          <input
            data-testid="providers-draft-name"
            placeholder="display name"
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            className="rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          <select
            data-testid="providers-draft-kind"
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProviderKind })}
            className="rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          >
            {(Object.keys(KIND_LABELS) as ProviderKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <input
            data-testid="providers-draft-model"
            placeholder="model"
            value={draft.model ?? ""}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            className="rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          {(draft.kind === "anthropic" ||
            draft.kind === "openai" ||
            draft.kind === "local-lmstudio") && (
            <input
              data-testid="providers-draft-apikey"
              placeholder="api key"
              value={draft.apiKey ?? ""}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              className="col-span-2 rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
            />
          )}
          {(draft.kind === "local-ollama" ||
            draft.kind === "local-lmstudio" ||
            draft.kind === "openai" ||
            draft.kind === "anthropic") && (
            <input
              data-testid="providers-draft-baseurl"
              placeholder="base url (optional)"
              value={draft.baseUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              className="col-span-2 rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
            />
          )}
        </div>
        <button
          type="button"
          data-testid="providers-draft-add"
          disabled={!draftValid}
          onClick={add}
          className="self-end rounded border border-[var(--border-weak)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--fg)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add provider
        </button>
      </div>
    </div>
  );
}

function makeEmptyDraft(): ProviderInstance {
  return {
    id: "",
    displayName: "",
    kind: "anthropic",
    model: "",
    apiKey: "",
    baseUrl: "",
  };
}

function isDraftValid(draft: ProviderInstance): boolean {
  if (!/^[a-z0-9_-]+$/i.test(draft.id)) return false;
  if (draft.displayName.trim() === "") return false;
  if (draft.kind === "anthropic" || draft.kind === "openai") {
    if (!draft.apiKey?.trim()) return false;
    if (!draft.model?.trim()) return false;
  }
  if (draft.kind === "local-ollama" || draft.kind === "local-lmstudio") {
    if (!draft.model?.trim()) return false;
  }
  return true;
}
