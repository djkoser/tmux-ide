import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { getSessionName, readConfig } from "./lib/yaml-io.ts";
import type { IdeConfig } from "./types.ts";
import { getSessionState } from "./lib/tmux.ts";
import {
  listSessionPanes,
  sendCommand,
  sendText,
  getPaneBusyStatus,
  getPaneReadiness,
  isAgentPane,
  type PaneInfo,
  type PaneBusyStatus,
} from "./widgets/lib/pane-comms.ts";
import { appendEvent } from "./lib/event-log.ts";
import { IdeError } from "./lib/errors.ts";
import {
  allocateSeq,
  writeEnvelope,
  readReceipt,
  recipientKey,
  type ReceiptStatus,
} from "./lib/messaging.ts";

export const LONG_MESSAGE_THRESHOLD = 150;

/**
 * The single-line trigger a recipient runs to receive a message. Neutral by
 * design: running `recv` only prints the body — the recipient decides whether
 * it's a directive, a question, or an FYI. No "execute" language.
 */
export function buildRecvTrigger(msgId: string): string {
  return `New message — run: tmux-ide recv ${msgId}`;
}

export interface ReliableSendTiming {
  /** Total per-recipient budget before the send is declared failed. */
  timeoutMs: number;
  /** Base window between re-pastes; doubles each retry (capped at timeoutMs). */
  retryIntervalMs: number;
  /** How often the receipt file is polled within a window. */
  pollIntervalMs: number;
  /** Maximum number of re-pastes after the first paste. */
  maxRetries: number;
}

export const DEFAULT_TIMING: ReliableSendTiming = {
  timeoutMs: 45_000,
  retryIntervalMs: 8_000,
  pollIntervalMs: 500,
  maxRetries: 4,
};

/**
 * Tight timing for the mission-wipe stand-down broadcast. The kill-switch awaits
 * every pane's delivery before clearing the messaging store, so the per-pane
 * budget is the user-visible confirm→response latency. A ~1.5s cap keeps that
 * response ≤2s even when several agent panes are mid-work and slow to ack, while
 * still re-pasting once and preserving the deliver-before-wipe ordering.
 */
export const WIPE_STANDDOWN_TIMING: ReliableSendTiming = {
  timeoutMs: 1_500,
  retryIntervalMs: 600,
  pollIntervalMs: 150,
  maxRetries: 1,
};

export type DeliveryOutcome = ReceiptStatus | "failed";

export interface DeliveryResult {
  pane: PaneInfo;
  msgId: string;
  seq: number;
  outcome: DeliveryOutcome;
  attempts: number;
}

/** Injectable side-effects so the retry/timeout loop is deterministic under test. */
export interface DeliveryDeps {
  paste: (session: string, paneId: string, trigger: string) => void;
  receiptStatus: (dir: string, msgId: string) => ReceiptStatus | null;
  sleep: (ms: number) => Promise<void>;
  /** Push a transient status-line alert + bell to a pane. Best-effort. */
  notify: (paneId: string, text: string) => void;
}

const realDeps: DeliveryDeps = {
  paste: (session, paneId, trigger) => {
    sendCommand(session, paneId, trigger);
  },
  receiptStatus: (dir, msgId) => readReceipt(dir, msgId)?.status ?? null,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  notify: (paneId, text) => {
    // Surface a queued inbox message on the recipient's status line without
    // pasting anything into the pane — a paste would inject into the running
    // agent, which is exactly what inbox mode avoids. Also flag the window as
    // urgent so its tab highlights even when it is not the focused window.
    // Best-effort: the pane may have vanished, or no client may be attached.
    try {
      execFileSync("tmux", ["display-message", "-t", paneId, "-d", "5000", text], {
        stdio: "ignore",
      });
    } catch {
      // no client / pane gone — nothing to notify
    }
    try {
      execFileSync("tmux", ["set-window-option", "-t", paneId, "window-status-activity-style", "reverse"], {
        stdio: "ignore",
      });
    } catch {
      // styling is a nicety; ignore failures
    }
  },
};

/**
 * Deliver one message to one agent pane and wait for the recipient's receipt.
 *
 * Pastes the recv trigger, then polls for the receipt the recipient writes when
 * it runs `tmux-ide recv`. If no receipt arrives within a backoff window the
 * trigger is re-pasted (bounded by maxRetries / timeoutMs); the final outcome
 * is the receipt status ("delivered" | "duplicate" | "superseded") or "failed".
 * Loop progress is measured by summed sleep time, not wall-clock, so injected
 * timing makes tests fast and deterministic.
 */
export async function deliverReliably(
  dir: string,
  session: string,
  pane: PaneInfo,
  body: string,
  batchId: string | undefined,
  timing: ReliableSendTiming,
  deps: DeliveryDeps = realDeps,
): Promise<DeliveryResult> {
  const recipient = pane.name ?? pane.title;
  const seq = allocateSeq(dir, recipient);
  const env = writeEnvelope(dir, { to: recipient, paneId: pane.id, body, seq, batchId });
  const trigger = buildRecvTrigger(env.msgId);

  const settled = (outcome: DeliveryOutcome, attempts: number): DeliveryResult => ({
    pane,
    msgId: env.msgId,
    seq,
    outcome,
    attempts,
  });

  deps.paste(session, pane.id, trigger);
  let attempts = 1;
  let waited = 0;
  let backoff = timing.retryIntervalMs;

  while (waited < timing.timeoutMs) {
    const windowEnd = Math.min(waited + backoff, timing.timeoutMs);
    while (waited < windowEnd) {
      const status = deps.receiptStatus(dir, env.msgId);
      if (status) return settled(status, attempts);
      await deps.sleep(timing.pollIntervalMs);
      waited += timing.pollIntervalMs;
    }
    if (attempts > timing.maxRetries) break;
    deps.paste(session, pane.id, trigger);
    attempts++;
    backoff = Math.min(backoff * 2, timing.timeoutMs);
  }

  const finalStatus = deps.receiptStatus(dir, env.msgId);
  return finalStatus ? settled(finalStatus, attempts) : settled("failed", attempts);
}

/**
 * Deliver one message to an inbox-mode recipient: envelope only, never a paste.
 *
 * Allocates the seq and writes the envelope exactly like deliverReliably, then
 * pushes a status-line notification to the pane (so the recipient is alerted
 * without a paste) and polls the receipt for the full timeout — the
 * recipient's own `inbox watch` loop is what surfaces the message, so there is
 * nothing to retry. attempts is 0 (no pastes). A "failed" outcome means "not
 * yet acked": the envelope stays pending in the outbox and is still picked up
 * by the recipient later.
 */
export async function deliverToInbox(
  dir: string,
  pane: PaneInfo,
  body: string,
  batchId: string | undefined,
  timing: ReliableSendTiming,
  deps: DeliveryDeps = realDeps,
): Promise<DeliveryResult> {
  const recipient = pane.name ?? pane.title;
  const seq = allocateSeq(dir, recipient);
  const env = writeEnvelope(dir, { to: recipient, paneId: pane.id, body, seq, batchId });

  // Alert the recipient pane that a message landed. `#` is doubled because tmux
  // treats it as the format-expansion escape in display-message strings.
  const preview = body.replace(/\s+/g, " ").slice(0, 60).replace(/#/g, "##");
  deps.notify(pane.id, `📨 inbox: ${preview} — tmux-ide inbox watch ${recipient}`);

  const settled = (outcome: DeliveryOutcome): DeliveryResult => ({
    pane,
    msgId: env.msgId,
    seq,
    outcome,
    attempts: 0,
  });

  let waited = 0;
  while (waited < timing.timeoutMs) {
    const status = deps.receiptStatus(dir, env.msgId);
    if (status) return settled(status);
    await deps.sleep(timing.pollIntervalMs);
    waited += timing.pollIntervalMs;
  }

  const finalStatus = deps.receiptStatus(dir, env.msgId);
  return settled(finalStatus ?? "failed");
}

/**
 * Recipient keys (recipientKey) of panes flagged `inbox: true` in the target
 * dir's ide.yml. A missing or unreadable config means no inbox recipients.
 * Pane title is the key: launch stamps @ide_name from it, and send resolves
 * recipients by that name.
 */
export function readInboxRecipientKeys(dir: string): Set<string> {
  let cfg: IdeConfig;
  try {
    ({ config: cfg } = readConfig(dir));
  } catch {
    return new Set();
  }
  const keys = new Set<string>();
  for (const row of cfg?.rows ?? []) {
    for (const pane of row?.panes ?? []) {
      if (pane?.inbox && pane.title) keys.add(recipientKey(pane.title));
    }
  }
  return keys;
}

/**
 * Write a long message to a dispatch file and return the short trigger command.
 * Returns null if message is short enough to send directly.
 */
export function writeDispatchFile(
  dir: string,
  paneId: string,
  message: string,
): { filePath: string; triggerCmd: string } | null {
  if (message.length <= LONG_MESSAGE_THRESHOLD) return null;
  const dispatchDir = join(dir, ".tasks", "dispatch");
  if (!existsSync(dispatchDir)) mkdirSync(dispatchDir, { recursive: true });
  const paneSlug = paneId.replace("%", "");
  const filename = `send-${paneSlug}-${Date.now()}-${randomUUID().slice(0, 8)}.md`;
  const filePath = join(dispatchDir, filename);
  writeFileSync(filePath, message);
  return { filePath, triggerCmd: `New message — read: .tasks/dispatch/${filename}` };
}

interface SendOptions {
  json?: boolean;
  to?: string;
  message?: string;
  noEnter?: boolean;
  /** Skip the receipt/retry protocol: paste once, don't wait for an ack (legacy behavior). */
  fireAndForget?: boolean;
  /**
   * Force inbox mode on (true) or off (false) for this send; undefined defers
   * to the recipient pane's `inbox: true` in ide.yml.
   */
  inbox?: boolean;
  /** Override the reliable-send timing (tests / tuning). */
  timing?: Partial<ReliableSendTiming>;
}

/** A target containing glob metacharacters fans out to every matching agent pane. */
export function isWildcardTarget(target: string): boolean {
  return target.includes("*") || target.includes("?");
}

/**
 * Resolve a glob target ("cw*", "*") to all matching agent panes.
 * Matches case-insensitively against @ide_name and pane title; only agent
 * panes are eligible, so "*" broadcasts to every agent while widget/shell/
 * input panes are never typed into.
 */
export function resolvePanesByWildcard(panes: PaneInfo[], pattern: string): PaneInfo[] {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
    "i",
  );
  return panes.filter(
    (p) => isAgentPane(p) && ((p.name !== null && regex.test(p.name)) || regex.test(p.title)),
  );
}

/**
 * Resolve a send target to its pane list: glob targets fan out to every
 * matching agent pane; exact targets keep single-pane resolvePane behavior.
 */
export function resolveSendTargets(panes: PaneInfo[], target: string): PaneInfo[] {
  if (isWildcardTarget(target)) {
    return resolvePanesByWildcard(panes, target);
  }
  const pane = resolvePane(panes, target);
  return pane ? [pane] : [];
}

/**
 * Resolve a target string to a pane. Priority:
 * 1. Exact pane ID (%N)
 * 2. @ide_name match
 * 3. Exact title match
 * 4. Role match (lead, teammate, planner)
 * 5. Case-insensitive partial title match
 */
export function resolvePane(panes: PaneInfo[], target: string): PaneInfo | null {
  // 1. Exact pane ID
  if (target.startsWith("%")) {
    return panes.find((p) => p.id === target) ?? null;
  }

  // 2. @ide_name match
  const byName = panes.find((p) => p.name === target);
  if (byName) return byName;

  // 3. Exact title match
  const byTitle = panes.find((p) => p.title === target);
  if (byTitle) return byTitle;

  // 4. Role match
  const lower = target.toLowerCase();
  if (["lead", "teammate", "planner"].includes(lower)) {
    const byRole = panes.find((p) => p.role === lower);
    if (byRole) return byRole;
  }

  // 5. Case-insensitive partial title match
  const byPattern = panes.find((p) => p.title.toLowerCase().includes(lower));
  if (byPattern) return byPattern;

  return null;
}

function prepareMessage(message: string, busyStatus: PaneBusyStatus): string {
  if (busyStatus === "agent") {
    // Collapse multiline to single line for Claude Code TUI
    // Prevents paste preview that requires manual Enter
    return message.replace(/\n+/g, " ").trim();
  }
  return message;
}

export async function send(targetDir: string | undefined, opts: SendOptions): Promise<void> {
  const dir = resolve(targetDir ?? ".");
  const { name: session } = getSessionName(dir);
  const { json, to: target, message: rawMessage, noEnter } = opts;

  if (!target) {
    throw new IdeError("Missing target. Usage: tmux-ide send <target> <message>", {
      code: "USAGE",
    });
  }

  if (!rawMessage) {
    throw new IdeError("Missing message. Usage: tmux-ide send <target> <message>", {
      code: "USAGE",
    });
  }

  // Verify session is running
  const state = getSessionState(session);
  if (!state.running) {
    throw new IdeError(`Session "${session}" is not running`, {
      code: "SESSION_NOT_FOUND",
    });
  }

  const panes = listSessionPanes(session);
  const targets = resolveSendTargets(panes, target);
  if (targets.length === 0) {
    const available = panes
      .map((p) => {
        const label = p.name ?? p.title;
        return `  ${p.id}  ${label}${p.role ? ` (${p.role})` : ""}`;
      })
      .join("\n");
    const problem = isWildcardTarget(target)
      ? `Wildcard "${target}" matched no agent panes.`
      : `Pane "${target}" not found.`;
    throw new IdeError(`${problem}\n\nAvailable panes:\n${available}`, {
      code: "PANE_NOT_FOUND",
    });
  }

  const timing: ReliableSendTiming = { ...DEFAULT_TIMING, ...(opts.timing ?? {}) };
  // Only agent panes can run `recv`; non-agent panes (and --fire-and-forget /
  // --no-enter) fall back to a direct paste, which was never the unreliable case.
  const useReliable = !noEnter && !opts.fireAndForget;
  const batchId = targets.length > 1 ? randomUUID().slice(0, 8) : undefined;

  interface Report {
    pane: PaneInfo;
    outcome: DeliveryOutcome | "sent";
    attempts?: number;
    readiness?: string;
    inbox?: boolean;
  }

  // Inbox mode never touches the pane, so busy status is irrelevant to it.
  // --no-enter / --fire-and-forget explicitly request a paste and win over it.
  const inboxKeys = opts.inbox === undefined ? readInboxRecipientKeys(dir) : new Set<string>();
  const isInbox = (p: PaneInfo): boolean =>
    opts.inbox ?? inboxKeys.has(recipientKey(p.name ?? p.title));

  const inboxTargets = useReliable ? targets.filter((p) => isInbox(p)) : [];
  const reliableTargets = useReliable
    ? targets.filter(
        (p) => !inboxTargets.includes(p) && getPaneBusyStatus(session, p.id) === "agent",
      )
    : [];
  const directTargets = targets.filter(
    (p) => !inboxTargets.includes(p) && !reliableTargets.includes(p),
  );

  const directReports: Report[] = directTargets.map((pane) => {
    const busyStatus = getPaneBusyStatus(session, pane.id);
    const message = prepareMessage(rawMessage, busyStatus);
    if (noEnter) {
      sendText(session, pane.id, message);
    } else {
      const dispatch = writeDispatchFile(dir, pane.id, message);
      if (dispatch) sendCommand(session, pane.id, dispatch.triggerCmd);
      else sendCommand(session, pane.id, message);
    }
    appendEvent(dir, {
      timestamp: new Date().toISOString(),
      type: "send",
      target: pane.name ?? pane.title,
      paneId: pane.id,
      message: message.length > 100 ? message.slice(0, 100) + "..." : message,
    });
    return { pane, outcome: "sent" };
  });

  const [inboxResults, reliableResults] = await Promise.all([
    Promise.all(
      inboxTargets.map(async (pane) => {
        const res = await deliverToInbox(dir, pane, rawMessage, batchId, timing);
        appendEvent(dir, {
          timestamp: new Date().toISOString(),
          type: "send",
          target: pane.name ?? pane.title,
          paneId: pane.id,
          message: `[inbox:${res.outcome}] ${rawMessage.slice(0, 90)}`,
        });
        return { pane, outcome: res.outcome, attempts: res.attempts, inbox: true } as Report;
      }),
    ),
    Promise.all(
      reliableTargets.map(async (pane) => {
        const readiness = getPaneReadiness(session, pane.id);
        const res = await deliverReliably(dir, session, pane, rawMessage, batchId, timing);
        appendEvent(dir, {
          timestamp: new Date().toISOString(),
          type: "send",
          target: pane.name ?? pane.title,
          paneId: pane.id,
          message: `[${res.outcome}] ${rawMessage.slice(0, 90)}`,
        });
        return { pane, outcome: res.outcome, attempts: res.attempts, readiness } as Report;
      }),
    ),
  ]);

  // Re-order reports to match the original target order.
  const byPaneId = new Map<string, Report>();
  for (const r of [...directReports, ...reliableResults, ...inboxResults])
    byPaneId.set(r.pane.id, r);
  const reports = targets.map((p) => byPaneId.get(p.id)!);
  const anyFailed = reports.some((r) => r.outcome === "failed");

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: !anyFailed,
          session,
          fanOut: targets.length > 1,
          batchId: batchId ?? null,
          recipients: reports.map((r) => ({
            paneId: r.pane.id,
            name: r.pane.name,
            title: r.pane.title,
            role: r.pane.role,
            outcome: r.outcome,
            attempts: r.attempts ?? null,
            inbox: r.inbox ?? false,
          })),
        },
        null,
        2,
      ),
    );
    if (anyFailed) process.exitCode = 1;
    return;
  }

  for (const r of reports) {
    const label = r.pane.name ?? r.pane.title;
    if (r.outcome === "sent") {
      console.log(`Sent to "${label}" (${r.pane.id})`);
    } else if (r.outcome === "delivered") {
      console.log(
        r.inbox
          ? `Delivered to "${label}" (${r.pane.id}) — inbox, acked`
          : `Delivered to "${label}" (${r.pane.id}) — acked in ${r.attempts} attempt(s)`,
      );
    } else if (r.outcome === "duplicate" || r.outcome === "superseded") {
      console.log(`Delivered to "${label}" (${r.pane.id}) — ${r.outcome} (already handled)`);
    } else {
      console.log(
        r.inbox
          ? `FAILED to reach "${label}" (${r.pane.id}) — no ack yet; message queued in inbox`
          : `FAILED to reach "${label}" (${r.pane.id}) — no receipt after ${r.attempts} attempt(s)`,
      );
    }
  }

  if (anyFailed) {
    process.exitCode = 1;
    console.error(
      `send: ${reports.filter((r) => r.outcome === "failed").length}/${reports.length} recipient(s) did not acknowledge.`,
    );
  }
}
