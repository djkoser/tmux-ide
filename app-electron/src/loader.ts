/**
 * Thin entry point: opens a persistent log file FIRST, registers
 * top-level error handlers, then `require()`s the bundled main.cjs.
 *
 * Why a separate loader instead of putting this in main.ts? Because
 * Electron's behavior loading the bundled main.cjs directly proved
 * fragile — silent exits with no log output during certain launch
 * paths. The loader runs unbundled (or as a tiny self-contained
 * bundle) and survives those edge cases by writing diagnostics
 * before main.cjs touches anything.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const LOG = path.join(os.homedir(), "Library", "Logs", "tmux-ide", "loader.log");

function jot(line: string): void {
  try {
    mkdirSync(path.dirname(LOG), { recursive: true });
    appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* swallow — logging never blocks startup */
  }
}

jot(`loader: pid=${process.pid} cwd=${process.cwd()} electron=${process.versions.electron ?? "n/a"}`);
process.on("uncaughtException", (e) => jot(`uncaughtException ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`));
process.on("unhandledRejection", (r) => jot(`unhandledRejection ${r instanceof Error ? (r.stack ?? r.message) : String(r)}`));
process.on("exit", (code) => jot(`exit code=${code}`));

try {
  jot("loader: requiring main.cjs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(__dirname, "main.cjs"));
  jot("loader: main.cjs returned");
} catch (e) {
  jot(`loader: main.cjs THREW ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
}
