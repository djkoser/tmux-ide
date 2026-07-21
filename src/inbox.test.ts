import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inboxCommand, watchPending } from "./inbox.ts";
import {
  allocateSeq,
  writeEnvelope,
  receiveMessage,
  ensureMessagesDir,
} from "./lib/messaging.ts";
import { IdeError } from "./lib/errors.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-inbox-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function send(recipient: string, body: string): string {
  const seq = allocateSeq(dir, recipient);
  const env = writeEnvelope(dir, { to: recipient, paneId: "%1", body, seq });
  return env.msgId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function captureLogs(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  return { logs, restore: () => (console.log = original) };
}

describe("watchPending", () => {
  it("resolves immediately when messages are already pending (catch-up)", async () => {
    const id = send("lead", "queued while the watcher was down");
    const pending = await watchPending(dir, "lead");
    expect(pending.map((e) => e.msgId)).toEqual([id]);
  });

  it("blocks until an envelope for the recipient lands, then resolves with it", async () => {
    ensureMessagesDir(dir);
    let settled = false;
    const wait = watchPending(dir, "lead").then((pending) => {
      settled = true;
      return pending;
    });

    await sleep(30);
    expect(settled).toBe(false);

    const id = send("lead", "new mail");
    const pending = await wait;
    expect(pending.map((e) => e.msgId)).toEqual([id]);
  });

  it("stays blocked on envelopes addressed to other recipients", async () => {
    ensureMessagesDir(dir);
    let settled = false;
    const wait = watchPending(dir, "lead").then((pending) => {
      settled = true;
      return pending;
    });

    send("cw1", "not yours");
    await sleep(50);
    expect(settled).toBe(false);

    const mine = send("lead", "yours");
    const pending = await wait;
    expect(pending.map((e) => e.msgId)).toEqual([mine]);
  });

  it("does not resolve for envelopes that are already receipted", async () => {
    ensureMessagesDir(dir);
    let settled = false;
    const wait = watchPending(dir, "lead").then((pending) => {
      settled = true;
      return pending;
    });

    receiveMessage(dir, send("lead", "handled elsewhere"));
    await sleep(50);
    expect(settled).toBe(false);

    const fresh = send("lead", "actually new");
    const pending = await wait;
    expect(pending.map((e) => e.msgId)).toEqual([fresh]);
  });
});

describe("inboxCommand", () => {
  it("list --json prints machine-parseable pending envelopes", async () => {
    const id = send("lead", "hello");
    const { logs, restore } = captureLogs();
    try {
      await inboxCommand(dir, { sub: "list", recipient: "lead", json: true });
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n")) as {
      recipient: string;
      pending: { msgId: string; seq: number }[];
    };
    expect(parsed.recipient).toBe("lead");
    expect(parsed.pending.map((p) => p.msgId)).toEqual([id]);
    expect(parsed.pending[0]!.seq).toBe(1);
  });

  it("list prints a recv trigger per pending message", async () => {
    const id = send("lead", "hello");
    const { logs, restore } = captureLogs();
    try {
      await inboxCommand(dir, { sub: "list", recipient: "lead" });
    } finally {
      restore();
    }
    expect(logs).toEqual([`New message — run: tmux-ide recv ${id}`]);
  });

  it("list reports an empty inbox in plain output", async () => {
    ensureMessagesDir(dir);
    const { logs, restore } = captureLogs();
    try {
      await inboxCommand(dir, { sub: "list", recipient: "lead" });
    } finally {
      restore();
    }
    expect(logs).toEqual(['No pending messages for "lead".']);
  });

  it("watch exits with pending messages when they exist at start", async () => {
    const id = send("lead", "already waiting");
    const { logs, restore } = captureLogs();
    try {
      await inboxCommand(dir, { sub: "watch", recipient: "lead" });
    } finally {
      restore();
    }
    expect(logs).toEqual([`New message — run: tmux-ide recv ${id}`]);
  });

  it("rejects unknown subcommands and a missing recipient", async () => {
    await expect(inboxCommand(dir, { sub: "peek", recipient: "lead" })).rejects.toBeInstanceOf(
      IdeError,
    );
    await expect(inboxCommand(dir, { sub: "list" })).rejects.toBeInstanceOf(IdeError);
  });
});
