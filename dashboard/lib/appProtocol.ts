export interface TmuxIdeRuntime {
  port: number;
  version: string;
  apiBaseUrl?: string;
  wsUrl?: string;
  authToken?: string | null;
  localBypassToken?: string | null;
  on?: (channel: "menu:add-project" | "menu:open-settings", handler: () => void) => () => void;
}

const AUTH_TOKEN_STORAGE_KEY = "tmux-ide.remoteAccess.token";

function runtime(): TmuxIdeRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__TMUX_IDE__;
}

function normalizedPath(path: string): string {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function browserHost(): string {
  if (typeof window === "undefined") return "127.0.0.1";
  const host = window.location.hostname;
  if (!host || host === "localhost") return "127.0.0.1";
  return host;
}

function browserProtocol(): string {
  if (typeof window === "undefined") return "http:";
  const protocol = window.location.protocol;
  return protocol === "https:" ? "https:" : "http:";
}

/**
 * The port the page was loaded from. The daemon serves both the
 * dashboard (via the `app://` protocol in Electron, or directly over
 * HTTP in remote-browser mode) AND the API. So when there's no
 * Electron-injected port and no env override, the port the user
 * navigated to is the right answer. The only exception is the
 * `app://` protocol, which has no port — fall through to the env
 * default in that edge case.
 */
function browserPort(): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.protocol === "app:") return null;
  const port = window.location.port;
  return port && port.length > 0 ? port : null;
}

export function isElectron(): boolean {
  return runtime()?.port !== undefined;
}

function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSessionToken(token: string): void {
  try {
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // sessionStorage may be unavailable in hardened browser contexts.
  }
}

export function resolveAuthToken(): string | null {
  const injected = runtime();
  if (injected?.port !== undefined) {
    return injected.localBypassToken ?? injected.authToken ?? null;
  }
  if (typeof window === "undefined") return null;

  const token = new URLSearchParams(window.location.search).get("token");
  if (token) {
    writeSessionToken(token);
    return token;
  }
  return readSessionToken();
}

export function authHeaders(): Record<string, string> {
  const token = resolveAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function withAuthQuery(url: string): string {
  const token = resolveAuthToken();
  if (!token) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("token", token);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
}

export function resolveApiBase(): string {
  const injected = runtime();
  if (injected?.port) {
    return `http://127.0.0.1:${injected.port}`;
  }

  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  if (typeof window === "undefined") return "";

  // Remote browser path: the daemon serves the dashboard, so the
  // page's own port is always the API port. Fall back to the env
  // override (used by `next dev` against a side-launched daemon)
  // and finally to 6060 only as a last resort.
  const port = browserPort() ?? process.env.NEXT_PUBLIC_API_PORT ?? "6060";
  return `${browserProtocol()}//${browserHost()}:${port}`;
}

export function withApiBase(path: string): string {
  return `${resolveApiBase()}${normalizedPath(path)}`;
}

/**
 * Resolve the daemon's WebSocket base URL (no trailing slash, no path).
 * Mirrors `resolveApiBase` but returns a `ws://` / `wss://` URL. Use this
 * for `/ws/events` and `/ws/pty/:id` connections.
 *
 * Resolution order matches the API resolver: injected runtime port wins
 * (Electron preload), then `NEXT_PUBLIC_API_URL` (rewritten to ws), then
 * the browser-dev fallback.
 */
export function resolveWsBase(): string {
  const injected = runtime();
  if (injected?.port) {
    return `ws://127.0.0.1:${injected.port}`;
  }

  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) {
    const trimmed = explicit.replace(/\/$/, "");
    if (trimmed.startsWith("https:")) return `wss:${trimmed.slice("https:".length)}`;
    if (trimmed.startsWith("http:")) return `ws:${trimmed.slice("http:".length)}`;
    return trimmed;
  }

  if (typeof window === "undefined") return "";

  // Same logic as resolveApiBase: prefer the page's actual port.
  const port = browserPort() ?? process.env.NEXT_PUBLIC_API_PORT ?? "6060";
  const wsProto = browserProtocol() === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${browserHost()}:${port}`;
}

export function withWsBase(path: string): string {
  return withAuthQuery(`${resolveWsBase()}${normalizedPath(path)}`);
}
