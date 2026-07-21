import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  rmdirSync,
  statSync,
  writeFileSync,
  renameSync,
  readFileSync,
  readdirSync,
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
  // Unique tmp per writer: a fixed "file.tmp" lets two concurrent writers
  // interleave write/rename so the loser's rename hits ENOENT.
  const tmpPath = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmpPath, filePath);
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** A held lock older than this is treated as abandoned by a crashed holder. */
const LOCK_STALE_MS = 5_000;
const LOCK_SPIN_MS = 5;
const LOCK_MAX_SPINS = 40; // ~200ms of live contention before force-breaking

function lockIsStale(lockPath: string): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS;
  } catch {
    return true; // vanished between checks — treat as free
  }
}

/**
 * Serialize a per-recipient read-modify-write across processes with a mkdir
 * mutex (mkdir is atomic on POSIX). The CLI (a validator/writer pane) and the
 * daemon composer can send to the same recipient at once; without this both
 * read the same nextSeq, mint the same seq, and the second real message is
 * later rejected as "superseded" and silently dropped.
 *
 * Normal contention clears in a spin or two (the critical section is sub-ms).
 * A lock abandoned by a crashed holder is detected by age and broken, so a send
 * never blocks the caller (or the daemon's loop) for more than the short spin.
 */
function withRecipientLock<T>(dir: string, recipient: string, fn: () => T): T {
  ensureMessagesDir(dir);
  const lockPath = `${statePath(dir, recipient)}.lock`;
  const runHeld = (): T => {
    try {
      return fn();
    } finally {
      try {
        rmdirSync(lockPath);
      } catch {
        // best-effort release
      }
    }
  };

  for (let i = 0; i <= LOCK_MAX_SPINS; i++) {
    try {
      mkdirSync(lockPath); // throws EEXIST while held
      return runHeld();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (lockIsStale(lockPath)) {
        try {
          rmdirSync(lockPath);
        } catch {
          // someone else broke it — retry immediately
        }
        continue;
      }
      if (i < LOCK_MAX_SPINS) sleepMs(LOCK_SPIN_MS);
    }
  }

  // Live contention outlasted the spin budget — force-break as a last resort.
  try {
    rmdirSync(lockPath);
  } catch {
    // ignore
  }
  mkdirSync(lockPath);
  return runHeld();
}

export function outboxDir(dir: string): string {
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

function envelopePath(dir: string, msgId: string): string {
  return join(outboxDir(dir), `${msgId}.json`);
}
function receiptPath(dir: string, msgId: string): string {
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
  return withRecipientLock(dir, recipient, () => {
    const state = readState(dir, recipient);
    const seq = state.nextSeq;
    writeState(dir, recipient, { ...state, nextSeq: seq + 1 });
    return seq;
  });
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

/**
 * Envelopes awaiting pickup by a recipient: `to` matches (via recipientKey),
 * no receipt written yet, and seq newer than the last delivered one. Sorted by
 * seq so callers process in send order. Shared by `inbox list` and
 * `inbox watch` so "pending" has exactly one definition.
 */
export function listPendingEnvelopes(dir: string, recipient: string): MessageEnvelope[] {
  const out = outboxDir(dir);
  if (!existsSync(out)) return [];
  const key = recipientKey(recipient);
  const { lastDeliveredSeq } = readState(dir, recipient);
  const pending: MessageEnvelope[] = [];
  for (const file of readdirSync(out)) {
    if (!file.endsWith(".json")) continue;
    const env = readEnvelope(dir, file.slice(0, -".json".length));
    if (!env) continue;
    if (recipientKey(env.to) !== key) continue;
    if (env.seq <= lastDeliveredSeq) continue;
    if (readReceipt(dir, env.msgId)) continue;
    pending.push(env);
  }
  return pending.sort((a, b) => a.seq - b.seq);
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

  // The dedup check, the supersession compare, and the receipt/state writes are
  // one critical section per recipient — concurrent recvs must not both read the
  // same lastDeliveredSeq and race their receipts.
  return withRecipientLock(dir, env.to, () => {
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
  });
}
