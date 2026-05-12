/**
 * Preload bridge — runs in the renderer's isolated world before the page
 * loads. Exposes a typed, minimal `window.__TMUX_IDE__` object so the
 * dashboard knows which port to talk to without environment variable
 * gymnastics.
 *
 * Keep this file TINY. Anything risky lives in main; preload is the
 * thinnest possible surface that bridges main's environment to the
 * renderer.
 */

import { contextBridge, ipcRenderer } from "electron";
import {
  APP_UPDATE_CHECK_CHANNEL,
  APP_UPDATE_STATUS_CHANNEL,
  isMenuEventChannel,
  type AppUpdateStatusPayload,
  type MenuEventChannel,
} from "./ipc";

const port = Number(process.env.TMUX_IDE_DAEMON_PORT ?? 0);
const version = process.env.TMUX_IDE_APP_VERSION ?? "0.0.0";
const localBypassToken = process.env.TMUX_IDE_LOCAL_BYPASS_TOKEN ?? null;

if (port > 0) {
  contextBridge.exposeInMainWorld("__TMUX_IDE__", {
    port,
    version,
    localBypassToken,
    apiBaseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws/events`,
    on: (channel: MenuEventChannel, handler: () => void) => {
      if (!isMenuEventChannel(channel)) {
        throw new Error(`Unsupported tmux-ide preload channel: ${String(channel)}`);
      }
      const listener = () => handler();
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.off(channel, listener);
    },
    checkForUpdates: () => ipcRenderer.invoke(APP_UPDATE_CHECK_CHANNEL),
    onUpdateStatus: (handler: (payload: AppUpdateStatusPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AppUpdateStatusPayload) =>
        handler(payload);
      ipcRenderer.on(APP_UPDATE_STATUS_CHANNEL, listener);
      return () => ipcRenderer.off(APP_UPDATE_STATUS_CHANNEL, listener);
    },
  });
} else {
  // Defensive: if main forgot to set the port, expose nothing rather
  // than a broken object — the dashboard's resolver falls back to
  // env-driven defaults so browser-mode dev keeps working.
  console.warn("[tmux-ide preload] TMUX_IDE_DAEMON_PORT not set; renderer falls back to defaults");
}
