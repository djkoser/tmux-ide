"use client";

import { useState, useEffect, useRef } from "react";
import {
  sendToTargets,
  fetchSendBatch,
  type SendRecipient,
  type ReceiptStatus,
} from "@/lib/api";

interface ComposerDockProps {
  sessionName: string;
}

const STATUS_COLOR: Record<ReceiptStatus, string> = {
  retrying: "var(--yellow)",
  delivered: "var(--green)",
  duplicate: "var(--cyan)",
  superseded: "var(--dim)",
  failed: "var(--red)",
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the batch's receipts until all recipients settle (no longer "retrying").
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const poll = async () => {
      const batch = await fetchSendBatch(sessionName, batchId);
      if (cancelled || !batch) return;
      setRecipients(batch.recipients);
      if (batch.done) stop();
    };
    void poll();
    pollRef.current = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [batchId, sessionName]);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || !target.trim()) return;
    setSending(true);
    setError("");
    setRecipients([]);
    setBatchId(null);
    const result = await sendToTargets(sessionName, {
      target: target.trim(),
      message: trimmed,
      fireAndForget: fireAndForget || undefined,
    });
    setSending(false);
    if (result.ok) {
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
