import type { BrowserWindow } from "electron";

export const MENU_EVENT_CHANNELS = ["menu:add-project", "menu:open-settings"] as const;
export const APP_UPDATE_CHECK_CHANNEL = "app:check-for-updates";
export const APP_UPDATE_STATUS_CHANNEL = "app:update-status";

export type MenuEventChannel = (typeof MENU_EVENT_CHANNELS)[number];
export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "update-available"
  | "no-update"
  | "update-downloaded"
  | "error";

export interface AppUpdateStatusPayload {
  status: AppUpdateStatus;
  message?: string;
}

export function isMenuEventChannel(value: string): value is MenuEventChannel {
  return (MENU_EVENT_CHANNELS as readonly string[]).includes(value);
}

export function sendMenuEvent(
  window: Pick<BrowserWindow, "webContents"> | null | undefined,
  channel: MenuEventChannel,
): void {
  window?.webContents.send(channel);
}
