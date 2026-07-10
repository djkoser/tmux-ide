import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allocateSeq,
  writeEnvelope,
  readEnvelope,
  readReceipt,
  receiveMessage,
  ensureMessagesDir,
  recipientKey,
} from "./messaging.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-msg-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function send(recipient: string, body: string): string {
  const seq = allocateSeq(dir, recipient);
  const env = writeEnvelope(dir, { to: recipient, paneId: "%1", body, seq });
  return env.msgId;
}

describe("allocateSeq", () => {
  it("hands out a per-recipient monotonic sequence", () => {
    expect(allocateSeq(dir, "cw3")).toBe(1);
    expect(allocateSeq(dir, "cw3")).toBe(2);
    expect(allocateSeq(dir, "cw3")).toBe(3);
  });

  it("tracks sequences independently per recipient", () => {
    expect(allocateSeq(dir, "cw3")).toBe(1);
    expect(allocateSeq(dir, "cw4")).toBe(1);
    expect(allocateSeq(dir, "cw3")).toBe(2);
  });

  it("normalizes decorated recipient labels to one namespace", () => {
    expect(recipientKey("⠐ cw3")).toBe(recipientKey("cw3"));
    allocateSeq(dir, "cw3");
    expect(allocateSeq(dir, "⠐ cw3")).toBe(2);
  });
});

describe("writeEnvelope / readEnvelope", () => {
  it("round-trips a durable envelope", () => {
    const id = send("cw3", "hello there");
    const env = readEnvelope(dir, id);
    expect(env).not.toBeNull();
    expect(env!.body).toBe("hello there");
    expect(env!.to).toBe("cw3");
    expect(env!.seq).toBe(1);
    expect(existsSync(join(dir, ".tasks/messages/outbox", `${id}.json`))).toBe(true);
  });

  it("returns null for an unknown message id", () => {
    ensureMessagesDir(dir);
    expect(readEnvelope(dir, "nope")).toBeNull();
  });
});

describe("receiveMessage — delivery", () => {
  it("delivers the body and writes a receipt on first receive", () => {
    const id = send("cw3", "do the thing");
    const result = receiveMessage(dir, id);
    expect(result.status).toBe("delivered");
    expect(result.body).toBe("do the thing");
    const receipt = readReceipt(dir, id);
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe("delivered");
    expect(receipt!.seq).toBe(1);
  });

  it("reports superseded when the message id is unknown", () => {
    const result = receiveMessage(dir, "ghost");
    expect(result.status).toBe("superseded");
    expect(result.body).toBeUndefined();
  });
});

describe("receiveMessage — dedup (idempotent redelivery)", () => {
  it("does not re-deliver the body on a repeat receive", () => {
    const id = send("cw3", "once only");
    expect(receiveMessage(dir, id).status).toBe("delivered");

    const second = receiveMessage(dir, id);
    expect(second.status).toBe("duplicate");
    expect(second.body).toBeUndefined();
  });

  it("keeps the original delivered receipt after a duplicate receive", () => {
    const id = send("cw3", "x");
    receiveMessage(dir, id);
    receiveMessage(dir, id);
    expect(readReceipt(dir, id)!.status).toBe("delivered");
  });
});

describe("receiveMessage — supersession (anti-replay)", () => {
  it("refuses an older message re-read after a newer one was delivered", () => {
    const first = send("cw3", "old directive");
    const second = send("cw3", "new directive");

    // Newer message processed first (seq 2)
    expect(receiveMessage(dir, second).status).toBe("delivered");
    // Stale replay of the older directive (seq 1) is rejected, body withheld
    const replay = receiveMessage(dir, first);
    expect(replay.status).toBe("superseded");
    expect(replay.body).toBeUndefined();
    expect(readReceipt(dir, first)!.status).toBe("superseded");
  });

  it("delivers messages in ascending seq order normally", () => {
    const first = send("cw3", "1");
    const second = send("cw3", "2");
    expect(receiveMessage(dir, first).status).toBe("delivered");
    expect(receiveMessage(dir, second).status).toBe("delivered");
  });
});
