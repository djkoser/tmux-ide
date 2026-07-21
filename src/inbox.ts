import { resolve } from "node:path";
import { watch } from "node:fs";
import {
  ensureMessagesDir,
  listPendingEnvelopes,
  outboxDir,
  type MessageEnvelope,
} from "./lib/messaging.ts";
import { buildRecvTrigger } from "./send.ts";
import { IdeError } from "./lib/errors.ts";

interface InboxOptions {
  json?: boolean;
  sub?: string;
  recipient?: string;
}

/**
 * Recipient-side view of the durable message store, for inbox-mode panes that
 * are never pasted into. `list` snapshots what is pending; `watch` blocks until
 * something is (exiting immediately if it already is), so an agent can run it
 * as a background task and be re-invoked when mail arrives.
 */
export async function inboxCommand(
  targetDir: string | undefined,
  opts: InboxOptions,
): Promise<void> {
  const dir = resolve(targetDir ?? ".");
  const { json, sub, recipient } = opts;

  if (sub !== "list" && sub !== "watch") {
    throw new IdeError("Usage: tmux-ide inbox <list|watch> <recipient> [--json]", {
      code: "USAGE",
    });
  }
  if (!recipient) {
    throw new IdeError(`Missing recipient. Usage: tmux-ide inbox ${sub} <recipient> [--json]`, {
      code: "USAGE",
    });
  }

  const pending =
    sub === "list" ? listPendingEnvelopes(dir, recipient) : await watchPending(dir, recipient);
  printPending(recipient, pending, { json, empty: sub === "list" && pending.length === 0 });
}

/**
 * Resolve with the pending envelopes for a recipient as soon as any exist.
 *
 * The watcher on the outbox dir is started before the catch-up listing so an
 * envelope landing between the two is never missed. Every fs event triggers a
 * full pending re-list — correctness never depends on a single event's payload
 * (macOS coalesces them).
 */
export function watchPending(dir: string, recipient: string): Promise<MessageEnvelope[]> {
  ensureMessagesDir(dir);
  return new Promise((resolvePending, reject) => {
    let done = false;
    const finish = (pending: MessageEnvelope[]): void => {
      done = true;
      watcher.close();
      resolvePending(pending);
    };

    const check = (): void => {
      if (done) return;
      const pending = listPendingEnvelopes(dir, recipient);
      if (pending.length > 0) finish(pending);
    };

    const watcher = watch(outboxDir(dir), check);
    watcher.on("error", (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });

    check(); // catch-up: pending at start exits without waiting for an event
  });
}

function printPending(
  recipient: string,
  pending: MessageEnvelope[],
  { json, empty }: { json?: boolean; empty: boolean },
): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          recipient,
          pending: pending.map((e) => ({
            msgId: e.msgId,
            seq: e.seq,
            createdAt: e.createdAt,
            batchId: e.batchId ?? null,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (empty) {
    console.log(`No pending messages for "${recipient}".`);
    return;
  }
  for (const env of pending) {
    console.log(buildRecvTrigger(env.msgId));
  }
}
