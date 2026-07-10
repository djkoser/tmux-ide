import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
} from "node:fs";
import { slugify } from "./slugify.ts";

/**
 * Reliable inter-pane messaging: durable envelopes + recipient-written receipts.
 *
 * A send is only trusted once the recipient acknowledges it (by running
 * `tmux-ide recv <msgId>`), not when tmux reports the paste succeeded — a busy
 * agent pane can drop pasted input. The recipient side (`recv`) is idempotent
 * (a receipt already on disk makes a repeat a no-op) and rejects stale replays
 * via a per-recipient monotonic sequence number, so an old directive re-read
 * after a newer one is dropped instead of reprocessed.
 */

const MESSAGES_DIR = ".tasks/messages";

export type ReceiptStatus = "delivered" | "duplicate" | "superseded";

export interface MessageEnvelope {
  msgId: string;
  /** Groups the per-recipient envelopes of one wildcard fan-out. */
  batchId?: string;
  /** Recipient label as resolved at send time (pane @ide_name or title). */
  to: string;
  paneId: string;
  body: string;
  createdAt: string;
  /** Per-recipient monotonic counter; older seq than last delivered = stale. */
  seq: number;
}

export interface Receipt {
  msgId: string;
  recipient: string;
  seq: number;
  status: ReceiptStatus;
  readAt: string;
}

interface RecipientState {
  nextSeq: number;
  lastDeliveredSeq: number;
}

function atomicWriteJSON(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmpPath, filePath);
}

function outboxDir(dir: string): string {
  return join(dir, MESSAGES_DIR, "outbox");
}
function receiptsDir(dir: string): string {
  return join(dir, MESSAGES_DIR, "receipts");
}
function stateDir(dir: string): string {
  return join(dir, MESSAGES_DIR, "state");
}

/** Create the messaging directory tree. Idempotent. */
export function ensureMessagesDir(dir: string): void {
  for (const d of [outboxDir(dir), receiptsDir(dir), stateDir(dir)]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

/** A recipient label maps to one state/receipt namespace regardless of casing. */
export function recipientKey(recipient: string): string {
  return slugify(recipient) || "unknown";
}

export function envelopePath(dir: string, msgId: string): string {
  return join(outboxDir(dir), `${msgId}.json`);
}
export function receiptPath(dir: string, msgId: string): string {
  return join(receiptsDir(dir), `${msgId}.json`);
}
function statePath(dir: string, recipient: string): string {
  return join(stateDir(dir), `${recipientKey(recipient)}.json`);
}

function readState(dir: string, recipient: string): RecipientState {
  const p = statePath(dir, recipient);
  if (!existsSync(p)) return { nextSeq: 1, lastDeliveredSeq: 0 };
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as Partial<RecipientState>;
    return {
      nextSeq: typeof raw.nextSeq === "number" ? raw.nextSeq : 1,
      lastDeliveredSeq: typeof raw.lastDeliveredSeq === "number" ? raw.lastDeliveredSeq : 0,
    };
  } catch {
    return { nextSeq: 1, lastDeliveredSeq: 0 };
  }
}

function writeState(dir: string, recipient: string, state: RecipientState): void {
  ensureMessagesDir(dir);
  atomicWriteJSON(statePath(dir, recipient), state);
}

/**
 * Allocate the next monotonic sequence number for a recipient (sender side).
 * Persisted so ordering survives across separate `send` invocations.
 */
export function allocateSeq(dir: string, recipient: string): number {
  const state = readState(dir, recipient);
  const seq = state.nextSeq;
  writeState(dir, recipient, { ...state, nextSeq: seq + 1 });
  return seq;
}

/** Persist a message envelope to the outbox and return it. */
export function writeEnvelope(
  dir: string,
  params: { to: string; paneId: string; body: string; seq: number; batchId?: string; msgId?: string },
): MessageEnvelope {
  ensureMessagesDir(dir);
  const env: MessageEnvelope = {
    msgId: params.msgId ?? randomUUID(),
    ...(params.batchId ? { batchId: params.batchId } : {}),
    to: params.to,
    paneId: params.paneId,
    body: params.body,
    createdAt: new Date().toISOString(),
    seq: params.seq,
  };
  atomicWriteJSON(envelopePath(dir, env.msgId), env);
  return env;
}

export function readEnvelope(dir: string, msgId: string): MessageEnvelope | null {
  const p = envelopePath(dir, msgId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as MessageEnvelope;
  } catch {
    return null;
  }
}

export function readReceipt(dir: string, msgId: string): Receipt | null {
  const p = receiptPath(dir, msgId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Receipt;
  } catch {
    return null;
  }
}

function writeReceipt(dir: string, receipt: Receipt): void {
  ensureMessagesDir(dir);
  atomicWriteJSON(receiptPath(dir, receipt.msgId), receipt);
}

export interface ReceiveResult {
  status: ReceiptStatus;
  /** The message text — present only on a first (delivered) receipt. */
  body?: string;
  note?: string;
}

/**
 * Recipient-side intake for one message. Writes the receipt the sender polls
 * for. Guarantees:
 *  - idempotent: a second call for the same msgId is a no-op ("duplicate"),
 *    body is not re-delivered;
 *  - anti-replay: a message whose seq is not newer than the last delivered one
 *    for this recipient is rejected ("superseded") and its body withheld.
 * A receipt is written in every case so the sender's poll resolves.
 */
export function receiveMessage(dir: string, msgId: string): ReceiveResult {
  const env = readEnvelope(dir, msgId);
  if (!env) {
    return { status: "superseded", note: `no message ${msgId} in outbox` };
  }

  const existing = readReceipt(dir, msgId);
  if (existing) {
    return { status: "duplicate", note: `message ${msgId} already received` };
  }

  const now = new Date().toISOString();
  const state = readState(dir, env.to);

  if (env.seq <= state.lastDeliveredSeq) {
    writeReceipt(dir, {
      msgId,
      recipient: env.to,
      seq: env.seq,
      status: "superseded",
      readAt: now,
    });
    return {
      status: "superseded",
      note: `message seq ${env.seq} superseded by ${state.lastDeliveredSeq}`,
    };
  }

  writeReceipt(dir, { msgId, recipient: env.to, seq: env.seq, status: "delivered", readAt: now });
  writeState(dir, env.to, { ...state, lastDeliveredSeq: env.seq });
  return { status: "delivered", body: env.body };
}
