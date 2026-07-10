import { resolve } from "node:path";
import { receiveMessage, readEnvelope } from "./lib/messaging.ts";
import { IdeError } from "./lib/errors.ts";

interface RecvOptions {
  json?: boolean;
  msgId?: string;
}

/**
 * Recipient-side receipt of a reliably-sent message.
 *
 * Prints the message body on first delivery (so the running agent sees it),
 * writes the receipt the sender is polling for, and is safe to run more than
 * once: a duplicate call re-prints nothing, and a superseded message (an older
 * directive re-read after a newer one) is reported and its body withheld.
 */
export async function recv(targetDir: string | undefined, opts: RecvOptions): Promise<void> {
  const dir = resolve(targetDir ?? ".");
  const { json, msgId } = opts;

  if (!msgId) {
    throw new IdeError("Missing message id. Usage: tmux-ide recv <msgId>", { code: "USAGE" });
  }

  const env = readEnvelope(dir, msgId);
  const result = receiveMessage(dir, msgId);

  if (json) {
    console.log(
      JSON.stringify(
        {
          msgId,
          status: result.status,
          from: env?.to ?? null,
          seq: env?.seq ?? null,
          body: result.body ?? null,
          note: result.note ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (result.status === "delivered") {
    console.log(result.body ?? "");
    return;
  }

  // Duplicate or superseded: no fresh body. Tell the reader why on stderr so
  // stdout stays clean for any body-capturing caller.
  console.error(
    result.status === "duplicate"
      ? `[recv] ${msgId} already received — ignoring.`
      : `[recv] ${msgId} superseded by a newer message — ignoring. ${result.note ?? ""}`.trim(),
  );
}
