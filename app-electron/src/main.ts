/**
 * tmux-ide desktop — Electron main process.
 *
 * Architecture: ONE node process. The daemon (HTTP/WS server, PTY bridge,
 * orchestrator) is loaded as a module and started in this process via
 * `startEmbeddedDaemon` from Slice E1. Killing the app cascades to a
 * graceful daemon shutdown via `app.on("before-quit")`. There is no
 * child_process, no port-discovery race, no IPC layer.
 *
 * Renderer loads the dashboard's static export from disk via the custom
 * `app://` protocol. The embedded daemon's port is injected into the
 * renderer through preload as `window.__TMUX_IDE__.port` so the
 * dashboard's API/WS clients use the right address without env vars.
 */

import { app, BrowserWindow, Menu, ipcMain, nativeImage, protocol, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promises as fs, appendFileSync } from "node:fs";
import os from "node:os";

import type { EmbeddedDaemonHandle } from "@tmux-ide/daemon";
import { attachOrStartDaemon } from "./daemon-bridge";
import {
  APP_UPDATE_CHECK_CHANNEL,
  APP_UPDATE_STATUS_CHANNEL,
  type AppUpdateStatusPayload,
  sendMenuEvent,
} from "./ipc";
import { buildMenu } from "./menu";

// ----- Persistent logging ---------------------------------------------------

/**
 * Always write structured log lines to ~/Library/Logs/tmux-ide/app.log
 * so that silent-exit modes (background launches, .app bundles) still
 * leave a debuggable trail. console.* still goes to stdout/stderr for
 * TTY launches.
 */
const LOG_FILE = path.join(os.homedir(), "Library", "Logs", "tmux-ide", "app.log");
function log(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  process.stderr.write(stamped);
  try {
    appendFileSync(LOG_FILE, stamped);
  } catch {
    // Best-effort — the parent dir may not exist on first run; create it
    // and retry. A persistent failure here doesn't block the app.
    try {
      const { mkdirSync } = require("node:fs") as typeof import("node:fs");
      mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      appendFileSync(LOG_FILE, stamped);
    } catch {
      /* swallow */
    }
  }
}
log(
  `main.cjs loaded (pid ${process.pid}, electron version ${process.versions.electron ?? "unknown"})`,
);

// ----- Globals & paths ------------------------------------------------------

const APP_NAME = "tmux-ide";
// Resolve the dashboard's static export differently in dev vs packaged:
//   - Dev: this file lives at app-electron/dist-electron/main.cjs;
//     dashboard/out is two levels up at the workspace root.
//   - Packaged: electron-builder ships dashboard/out under
//     `Contents/Resources/dashboard-out` (see `extraResources` in
//     electron-builder.yml). `process.resourcesPath` points at
//     `Contents/Resources/`.
const DASHBOARD_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "dashboard-out")
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "out");

let daemon: EmbeddedDaemonHandle | null = null;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
let updaterInitialized = false;
let packagedAutoUpdater: typeof import("electron-updater").autoUpdater | null = null;

function sendUpdateStatus(payload: AppUpdateStatusPayload): void {
  mainWindow?.webContents.send(APP_UPDATE_STATUS_CHANNEL, payload);
}

function daemonBindHostname(): string | undefined {
  // Only override when explicitly forced via env var. Otherwise let the
  // daemon decide based on `~/.tmux-ide/app-settings.json` (the
  // remote-access toggle the user controls in Settings).
  return process.env.TMUX_IDE_BIND_HOSTNAME === "0.0.0.0" ? "0.0.0.0" : undefined;
}


// ----- app:// protocol ------------------------------------------------------

/**
 * Custom protocol handler that serves the dashboard's static export.
 * Registered as a "standard" privileged scheme so it gets origin/CSP
 * semantics like `https://`. Falls back to `index.html` for unknown
 * paths so the SPA's client-side router can take over.
 */
function registerAppProtocol(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const requested = decodeURIComponent(url.pathname);
    const candidate = requested === "/" || requested === "" ? "/index.html" : requested;
    const filePath = path.join(DASHBOARD_DIR, candidate);

    try {
      // Normalize to defeat traversal: must resolve under DASHBOARD_DIR.
      const resolved = path.normalize(filePath);
      if (!resolved.startsWith(DASHBOARD_DIR)) {
        return new Response("Forbidden", { status: 403 });
      }
      const data = await fs.readFile(resolved);
      return new Response(new Uint8Array(data), {
        headers: contentTypeHeaders(resolved),
      });
    } catch {
      // SPA fallback: serve index.html for unknown paths so client-side
      // routing in the dashboard takes over.
      const fallback = path.join(DASHBOARD_DIR, "index.html");
      try {
        const data = await fs.readFile(fallback);
        return new Response(new Uint8Array(data), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }
  });
}

function contentTypeHeaders(filePath: string): Record<string, string> {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json; charset=utf-8",
  };
  return { "Content-Type": map[ext] ?? "application/octet-stream" };
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: false,
    },
  },
]);

// ----- Window ---------------------------------------------------------------

async function createMainWindow(): Promise<void> {
  const shouldOpenProjectDialog = await isProjectRegistryEmpty();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: "#0b0d11",
    // Themed header on macOS: traffic lights stay native (mandated by
    // Apple HIG) but the title bar background is painted by the
    // dashboard. The TopBar component reserves ~80px on the left for
    // the traffic lights and exposes `-webkit-app-region: drag` so the
    // user can drag the window from the themed bar.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    // Position traffic lights vertically centred against the dashboard's
    // 28px-tall TopBar. Default y=8 sits flush with a 20px bar; we use
    // 6 here so the lights centre on the slightly taller themed header.
    trafficLightPosition: { x: 16, y: 8 },
    // In packaged mode the .app bundle's Info.plist points at the
    // bundled icon — Electron picks it up automatically and the icon
    // path here would resolve INSIDE the asar (which doesn't ship the
    // .icns). In dev we point at the loose resources/ dir.
    ...(!app.isPackaged
      ? {
          icon: path.join(
            __dirname,
            "..",
            "resources",
            process.platform === "darwin" ? "icon.icns" : "icon.png",
          ),
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Renderer cannot reach into the daemon directly; it speaks HTTP/WS
      // to 127.0.0.1:<port> the same way the browser dashboard does.
    },
  });

  // Surface renderer-side failures aggressively so a blank window is
  // never a silent failure mode. Did-fail-load fires on protocol
  // mismatches, missing chunks, or CSP violations; render-process-gone
  // fires on crashes; preload errors fire when the bridge script throws.
  win.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[tmux-ide] renderer did-fail-load: ${errorCode} ${errorDescription} (${validatedURL})`,
    );
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[tmux-ide] render-process-gone:", details);
  });
  win.webContents.on("preload-error", (_e, preloadPath, err) => {
    console.error(`[tmux-ide] preload-error in ${preloadPath}:`, err);
  });
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer ${level}] ${sourceId}:${line} ${message}`);
    }
  });

  // During first-light development always open DevTools so we can see
  // renderer errors immediately. Disable via TMUX_IDE_HIDE_DEVTOOLS=1.
  if (!process.env.TMUX_IDE_HIDE_DEVTOOLS) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // External links (target=_blank etc.) open in the user's default browser
  // rather than spawning a second BrowserWindow.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // CSP: allow ws to localhost (the embedded daemon) + inline styles for
  // the static export. Tightened from Next defaults; revisit if specific
  // libraries need more.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          // `script-src 'unsafe-inline'` permits Next.js's inline theme
          // bootstrap; harden to nonces/hashes once we control the
          // export pipeline.
          "default-src 'self' app: data:; " +
            "connect-src 'self' app: http://127.0.0.1:* ws://127.0.0.1:*; " +
            "img-src 'self' app: data: https:; " +
            "style-src 'self' app: 'unsafe-inline'; " +
            "script-src 'self' app: 'unsafe-inline' 'unsafe-eval'; " +
            "font-src 'self' app: data:;",
        ],
      },
    });
  });

  // In dev, the dashboard runs at localhost:3000 (Next dev server). In
  // packaged builds we load the static export via the app:// protocol.
  const devUrl = process.env.TMUX_IDE_DASHBOARD_DEV_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadURL("app://-/index.html");
  }

  if (shouldOpenProjectDialog) {
    setTimeout(() => {
      if (!win.isDestroyed()) sendMenuEvent(win, "menu:add-project");
    }, 400);
  }

  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
}

function initializeAutoUpdater(): typeof import("electron-updater").autoUpdater | null {
  if (!app.isPackaged) return null;
  if (updaterInitialized) return packagedAutoUpdater;
  updaterInitialized = true;

  try {
    const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
    autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };
    autoUpdater.on("error", (err: Error) => {
      log(`autoUpdater error: ${err.message}`);
      sendUpdateStatus({ status: "error", message: err.message });
    });
    autoUpdater.on("update-available", (info) => {
      log("autoUpdater: update available");
      sendUpdateStatus({ status: "update-available", message: `Version ${info.version}` });
    });
    autoUpdater.on("update-not-available", (info) => {
      log("autoUpdater: no update available");
      sendUpdateStatus({ status: "no-update", message: `Current version ${info.version}` });
    });
    autoUpdater.on("update-downloaded", (info) => {
      log("autoUpdater: update downloaded; will install on quit");
      sendUpdateStatus({ status: "update-downloaded", message: `Version ${info.version}` });
    });
    packagedAutoUpdater = autoUpdater;
    return autoUpdater;
  } catch (err) {
    log(`autoUpdater init failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function checkForUpdates(options: { notify: boolean } = { notify: false }): Promise<void> {
  sendUpdateStatus({ status: "checking" });
  if (!app.isPackaged) {
    sendUpdateStatus({ status: "no-update", message: "Updates are only available in packaged builds." });
    return;
  }

  const autoUpdater = initializeAutoUpdater();
  if (!autoUpdater) {
    sendUpdateStatus({ status: "error", message: "Updater is not available." });
    return;
  }

  try {
    if (options.notify) {
      await autoUpdater.checkForUpdatesAndNotify();
    } else {
      await autoUpdater.checkForUpdates();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`autoUpdater check failed: ${message}`);
    sendUpdateStatus({ status: "error", message });
  }
}

ipcMain.handle(APP_UPDATE_CHECK_CHANNEL, async () => {
  await checkForUpdates();
});

async function isProjectRegistryEmpty(): Promise<boolean> {
  const registryPath = path.join(os.homedir(), ".tmux-ide", "projects.json");
  try {
    const raw = await fs.readFile(registryPath, "utf-8");
    if (raw.trim().length === 0) return true;
    const parsed = JSON.parse(raw) as { projects?: unknown };
    return !Array.isArray(parsed.projects) || parsed.projects.length === 0;
  } catch {
    return true;
  }
}

// ----- Lifecycle ------------------------------------------------------------

async function bootstrap(): Promise<void> {
  log("bootstrap: registering app:// protocol");
  registerAppProtocol();
  Menu.setApplicationMenu(buildMenu({ Menu, BrowserWindow, shell }));

  // macOS dock icon: BrowserWindow's `icon` option doesn't set the dock
  // for unpackaged dev runs. `app.dock.setIcon` does. Packaged builds
  // get the dock icon from the bundled .icns via Info.plist — no
  // runtime call needed (and the loose icon.png isn't shipped inside
  // the asar anyway).
  if (!app.isPackaged && process.platform === "darwin" && app.dock) {
    const iconPath = path.join(__dirname, "..", "resources", "icon.png");
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
        log(`bootstrap: dock icon set from ${iconPath}`);
      } else {
        log(`bootstrap: dock icon image was empty at ${iconPath}`);
      }
    } catch (err) {
      log(`bootstrap: dock icon failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log("bootstrap: attaching or starting daemon");
  daemon = await attachOrStartDaemon({
    bindHostname: daemonBindHostname(),
    log,
    forceEmbed: process.env.TMUX_IDE_FORCE_EMBED === "1",
  });
  log(`bootstrap: daemon ready at ${daemon.apiBaseUrl}`);

  // Inject the port into the preload script via a process env var. The
  // preload reads it on load and exposes it as `window.__TMUX_IDE__`.
  process.env.TMUX_IDE_DAEMON_PORT = String(daemon.port);
  process.env.TMUX_IDE_LOCAL_BYPASS_TOKEN = daemon.localBypassToken ?? "";
  process.env.TMUX_IDE_APP_VERSION = app.getVersion();

  log("bootstrap: creating main window");
  await createMainWindow();
  void checkForUpdates({ notify: true });
  log("bootstrap: window created — done");
}

app.setName(APP_NAME);

// Single-instance lock: relaunching the app focuses the existing window
// instead of starting a second daemon (which would fail to bind the
// same port and confuse the renderer).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(bootstrap)
    .catch((err) => {
      log(`bootstrap failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      app.quit();
    });
}

// Graceful shutdown: stop the daemon BEFORE the app fully quits so HTTP
// drains, WS clients get code 1001, and PTY children receive SIGTERM.
// `event.preventDefault()` lets us await the async stop.
app.on("before-quit", async (event) => {
  if (quitting || !daemon) return;
  quitting = true;
  event.preventDefault();
  try {
    await daemon.stop({ gracefulMs: 2000 });
  } catch (err) {
    console.error("[tmux-ide] daemon shutdown error:", err);
  } finally {
    daemon = null;
    app.exit(0);
  }
});

// Standard macOS behavior: keep the app alive in the dock when all
// windows close (clicking the dock icon re-creates the main window via
// the `activate` handler below). Other platforms quit immediately.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Re-create the window when the dock icon is clicked and the app is
// already running but has no windows (macOS standard behavior).
app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

// SIGTERM/SIGINT from a parent terminal cascade to app.quit, which then
// flows through `before-quit` and stops the daemon cleanly.
process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());

// Log uncaughtException but DON'T auto-quit — the daemon's HTTP server
// can stay up even when sub-systems (orchestrator, watchers) trip over
// missing config. Truly fatal errors are surfaced as DaemonStartupError
// before the window opens; the user sees those via the bootstrap-failed
// log line at ~/Library/Logs/tmux-ide/app.log.
process.on("uncaughtException", (err) => {
  log(`uncaughtException: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

process.on("unhandledRejection", (reason) => {
  log(
    `unhandledRejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
  );
});

app.on("will-quit", () => log("app will-quit"));

// `pathToFileURL` is imported but not used here; the LSP keeps imports
// lean for now and we'll wire it once the static-export loader needs it.
void pathToFileURL;
