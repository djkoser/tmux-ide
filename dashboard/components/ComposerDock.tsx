"use client";

import { useState, useEffect, useRef } from "react";
import {
  sendToTargets,
  fetchSendBatch,
  fetchWorkspaces,
  workspaceBaseUrl,
  type SendRecipient,
  type ReceiptStatus,
  type WorkspaceEntry,
} from "@/lib/api";
import { nextPollDecision, markPendingUnknown } from "@/lib/composer-poll";

interface ComposerDockProps {
  sessionName: string;
}

// A send target pod: the local workspace or a registered remote one. base "" = same-origin.
interface Pod {
  key: string;
  label: string;
  base: string;
  session: string;
}

const STATUS_COLOR: Record<ReceiptStatus, string> = {
  retrying: "var(--yellow)",
  delivered: "var(--green)",
  duplicate: "var(--cyan)",
  superseded: "var(--dim)",
  failed: "var(--red)",
  unknown: "var(--dim)",
};

/**
 * Persistent bottom dock replacing the tmux team-input pane. Sends route through
 * the server's reliable-send path (deliverReliably); the send returns a batchId
 * immediately and this polls per-recipient receipts until every one settles.
 */
export function ComposerDock({ sessionName }: ComposerDockProps) {
  const [target, setTarget] = useState("lead");
  const [message, setMessage] = useState("");
  const [fireAndForget, setFireAndForget] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<SendRecipient[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [podKey, setPodKey] = useState("local");
  // The pod a batch was sent to — polled for receipts on that same daemon.
  const activePod = useRef<Pod | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pods: Pod[] = [
    { key: "local", label: "this workspace", base: "", session: sessionName },
    ...workspaces.map((ws) => ({
      key: ws.name,
      label: ws.name,
      base: workspaceBaseUrl(ws),
      session: ws.session,
    })),
  ];
  const selectedPod = pods.find((p) => p.key === podKey) ?? pods[0]!;

  useEffect(() => {
    void fetchWorkspaces().then(setWorkspaces);
  }, []);

  // Poll the batch's receipts until all recipients settle (no longer "retrying").
  useEffect(() => {
    if (!batchId) return;
    const pod = activePod.current;
    if (!pod) return;
    let cancelled = false;
    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // Count consecutive unreachable polls so the interval can't run forever if the
    // daemon bounces mid-batch (kill-switch) or the tracker loses the id (404).
    let misses = 0;
    const poll = async () => {
      const batch = await fetchSendBatch(pod.session, batchId, pod.base);
      if (cancelled) return;
      const decision = nextPollDecision(batch, misses);
      misses = decision.misses;
      if (decision.recipients) setRecipients(decision.recipients);
      if (decision.gaveUp) setRecipients((prev) => markPendingUnknown(prev));
      if (decision.stop) stop();
    };
    void poll();
    pollRef.current = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [batchId]);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || !target.trim()) return;
    setSending(true);
    setError("");
    setRecipients([]);
    setBatchId(null);
    const pod = selectedPod;
    const result = await sendToTargets(
      pod.session,
      { target: target.trim(), message: trimmed, fireAndForget: fireAndForget || undefined },
      pod.base,
    );
    setSending(false);
    if (result.ok) {
      activePod.current = pod;
      setRecipients(result.batch.recipients);
      setBatchId(result.batch.batchId);
      setMessage("");
    } else {
      const hint = result.available?.length
        ? ` — available: ${result.available.map((p) => p.name ?? p.title).join(", ")}`
        : "";
      setError(`${result.error}${hint}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends; plain Enter inserts a newline (messages are multiline).
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  }

  const inputClass =
    "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] px-2 py-1 outline-none focus:border-[var(--accent)] placeholder:text-[var(--dim)]";

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between px-3 h-7 bg-[var(--surface)]">
        <span className="text-[var(--dim)] text-[11px] uppercase tracking-wider">team input</span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="text-[var(--dim)] hover:text-[var(--fg)] text-[11px]"
        >
          {collapsed ? "▲ expand" : "▼ collapse"}
        </button>
      </div>

      {!collapsed && (
        <div className="p-2 space-y-2">
          <div className="flex items-start gap-2">
            {pods.length > 1 && (
              <select
                value={podKey}
                onChange={(e) => setPodKey(e.target.value)}
                className={`${inputClass} w-32 shrink-0`}
                aria-label="workspace"
              >
                {pods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="lead · cw* · *"
              className={`${inputClass} w-32 shrink-0`}
              aria-label="target"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message… (⌘/Ctrl+Enter to send)"
              rows={2}
              className={`${inputClass} flex-1 resize-none`}
              aria-label="message"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !message.trim() || !target.trim()}
                className="px-3 py-1 text-[var(--bg)] bg-[var(--accent)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sending ? "sending…" : "send"}
              </button>
              <label className="flex items-center gap-1 text-[var(--dim)] text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={fireAndForget}
                  onChange={(e) => setFireAndForget(e.target.checked)}
                />
                f&amp;f
              </label>
            </div>
          </div>

          {error && <div className="text-[var(--red)] text-[11px]">{error}</div>}

          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipients.map((r) => (
                <span
                  key={r.paneId}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] border border-[var(--border)] bg-[var(--surface)]"
                  title={`${r.status}${r.attempts ? ` · ${r.attempts} attempt(s)` : ""}`}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[r.status] }}
                  />
                  <span className="text-[var(--fg)]">{r.name ?? r.title}</span>
                  <span style={{ color: STATUS_COLOR[r.status] }}>{r.status}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
