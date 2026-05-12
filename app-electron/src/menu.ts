import type { BrowserWindow, Menu as ElectronMenu, MenuItemConstructorOptions } from "electron";
import { sendMenuEvent } from "./ipc";

interface MenuFactoryDeps {
  Menu: {
    buildFromTemplate(template: MenuItemConstructorOptions[]): ElectronMenu;
  };
  BrowserWindow: {
    getFocusedWindow(): BrowserWindow | null;
    getAllWindows(): BrowserWindow[];
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  platform?: NodeJS.Platform;
}

function targetWindow(BrowserWindow: MenuFactoryDeps["BrowserWindow"]): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export function buildMenuTemplate({
  platform = process.platform,
  send,
  openExternal,
  appName = "tmux-ide",
}: {
  platform?: NodeJS.Platform;
  send: (channel: "menu:add-project" | "menu:open-settings") => void;
  openExternal: (url: string) => void;
  appName?: string;
}): MenuItemConstructorOptions[] {
  const isMac = platform === "darwin";
  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New Project...",
        accelerator: "CmdOrCtrl+N",
        click: () => send("menu:add-project"),
      },
      {
        label: "Open Project...",
        accelerator: "CmdOrCtrl+O",
        click: () => send("menu:add-project"),
      },
      { type: "separator" },
      isMac ? { role: "close", label: "Close Window", accelerator: "Cmd+W" } : { role: "quit" },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload", accelerator: "CmdOrCtrl+R" },
      { role: "forceReload", accelerator: "CmdOrCtrl+Shift+R" },
      { role: "toggleDevTools", accelerator: "Alt+CmdOrCtrl+I" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: "help",
    submenu: [
      {
        label: "GitHub Repository",
        click: () => openExternal("https://github.com/wavyrai/tmux-ide"),
      },
      {
        label: "Report Issue",
        click: () => openExternal("https://github.com/wavyrai/tmux-ide/issues"),
      },
    ],
  };

  if (!isMac) {
    return [fileMenu, viewMenu, helpMenu];
  }

  return [
    {
      label: appName,
      submenu: [
        { role: "about", label: `About ${appName}` },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "Cmd+,",
          click: () => send("menu:open-settings"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", accelerator: "Cmd+Q" },
      ],
    },
    fileMenu,
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    viewMenu,
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "close" },
      ],
    },
    helpMenu,
  ];
}

export function buildMenu({ Menu, BrowserWindow, shell, platform }: MenuFactoryDeps): ElectronMenu {
  return Menu.buildFromTemplate(
    buildMenuTemplate({
      platform,
      send: (channel) => sendMenuEvent(targetWindow(BrowserWindow), channel),
      openExternal: (url) => void shell.openExternal(url),
    }),
  );
}
