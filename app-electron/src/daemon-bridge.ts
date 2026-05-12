/**
 * Daemon bridge — discover-first attachment for the Electron host.
 *
 * The desktop app shares the canonical daemon lifecycle with the CLI:
 * if a daemon is already running (`~/.tmux-ide/daemon.json` is fresh
 * and the process answers `/healthz`), the app attaches to it rather
 * than spawning a duplicate. Only when no canonical daemon is alive
 * does the app fall back to `startEmbeddedDaemon`.
 *
 * Rationale:
 *   - Dev loop: `pnpm tmux-ide` already leaves a daemon on :6060.
 *     Killing it on every Electron restart would tear down chat
 *     sessions, websockets, and PTY children.
 *   - First-launch / standalone .app: there is no daemon yet; embed
 *     one in-process so the app is self-contained.
 *
 * The returned shape is `EmbeddedDaemonHandle`; external-daemon
 * attachments expose a no-op `stop()` so `before-quit` does not kill
 * a daemon the app did not start.
 */

import {
  startEmbeddedDaemon,
  isCanonicalDaemonAlive,
  readCanonicalDaemonInfo,
  type CanonicalDaemonInfo,
  type EmbeddedDaemonHandle,
} from "@tmux-ide/daemon";

export type LogFn = (line: string) => void;

export interface AttachOrStartOptions {
  /** Override bind hostname when starting embedded. Defaults to daemon's choice. */
  bindHostname?: string;
  /** When set, skip discovery and always embed. Used by tests + forced isolation. */
  forceEmbed?: boolean;
  /** Optional logger for diagnostic lines (matches main.ts's `log`). */
  log?: LogFn;
  /** Injection points for tests. */
  readInfo?: () => CanonicalDaemonInfo | null;
  isAlive?: (info: CanonicalDaemonInfo) => Promise<boolean>;
  embed?: (opts: { bindHostname?: string }) => Promise<EmbeddedDaemonHandle>;
}

export async function attachOrStartDaemon(
  opts: AttachOrStartOptions = {},
): Promise<EmbeddedDaemonHandle> {
  const log = opts.log ?? (() => undefined);
  const readInfo = opts.readInfo ?? readCanonicalDaemonInfo;
  const isAlive = opts.isAlive ?? isCanonicalDaemonAlive;
  const embed =
    opts.embed ??
    ((embedOpts) =>
      startEmbeddedDaemon({
        bindHostname: embedOpts.bindHostname,
        takeoverIfRunning: false,
      }));

  if (!opts.forceEmbed) {
    const info = readInfo();
    if (info && (await isAlive(info))) {
      log(
        `daemon: reusing canonical daemon (pid=${info.pid}, port=${info.port}, version=${info.version})`,
      );
      return makeExternalDaemonHandle(info);
    }
  }
  log("daemon: no canonical daemon alive — starting embedded daemon");
  return embed({ bindHostname: opts.bindHostname });
}

export function makeExternalDaemonHandle(info: CanonicalDaemonInfo): EmbeddedDaemonHandle {
  const host = info.bindHostname === "0.0.0.0" ? "127.0.0.1" : info.bindHostname;
  return {
    port: info.port,
    apiBaseUrl: `http://${host}:${info.port}`,
    wsUrl: `ws://${host}:${info.port}`,
    localBypassToken: info.authToken,
    activateProject: async () =>
      Promise.resolve({ stop: async () => undefined }) as unknown as ReturnType<
        EmbeddedDaemonHandle["activateProject"]
      >,
    stop: async () => undefined,
  };
}
