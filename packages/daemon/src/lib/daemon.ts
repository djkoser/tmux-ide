/**
 * Orphaned legacy daemon entrypoint.
 *
 * The per-session daemon spawn path is removed. This file is retained only
 * for stale external invocations and starts the canonical headless daemon in
 * this process. Prefer `tmux-ide --headless`.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { startEmbeddedDaemon, type EmbeddedDaemonHandle } from "./daemon-embed.ts";

async function main(): Promise<void> {
  const rawPort = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : process.argv[3];
  const port = rawPort === undefined || rawPort === "0" ? undefined : Number.parseInt(rawPort, 10);
  let handle: EmbeddedDaemonHandle;
  try {
    handle = await startEmbeddedDaemon({ port, bindHostname: "127.0.0.1" });
  } catch (err) {
    console.error("[daemon] failed to start:", err);
    process.exit(1);
  }

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await handle.stop();
      process.exit(0);
    } catch (err) {
      console.error("[daemon] failed to stop:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) void main();
