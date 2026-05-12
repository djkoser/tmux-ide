import { describe, expect, it, vi } from "vitest";
import { buildMenuTemplate } from "./menu";

function labels(platform: NodeJS.Platform): string[] {
  return buildMenuTemplate({
    platform,
    send: vi.fn(),
    openExternal: vi.fn(),
  }).map((item) => String(item.label ?? item.role));
}

describe("buildMenuTemplate", () => {
  it("builds the native macOS top-level menu", () => {
    expect(labels("darwin")).toEqual(["tmux-ide", "File", "Edit", "View", "Window", "help"]);
  });

  it("builds the compact non-macOS top-level menu", () => {
    expect(labels("linux")).toEqual(["File", "View", "help"]);
    expect(labels("win32")).toEqual(["File", "View", "help"]);
  });

  it("wires project and settings menu actions", () => {
    const send = vi.fn();
    const template = buildMenuTemplate({ platform: "darwin", send, openExternal: vi.fn() });
    const appSubmenu = template[0]?.submenu as Array<{ label?: string; click?: () => void }>;
    const fileSubmenu = template[1]?.submenu as Array<{ label?: string; click?: () => void }>;

    appSubmenu.find((item) => item.label === "Settings...")?.click?.();
    fileSubmenu.find((item) => item.label === "New Project...")?.click?.();

    expect(send).toHaveBeenCalledWith("menu:open-settings");
    expect(send).toHaveBeenCalledWith("menu:add-project");
  });

  it("File menu exposes New Project and Open Project", () => {
    const template = buildMenuTemplate({
      platform: "darwin",
      send: vi.fn(),
      openExternal: vi.fn(),
    });
    const fileSubmenu = template[1]?.submenu as Array<{ label?: string; accelerator?: string }>;
    const labels = fileSubmenu.map((item) => item.label).filter(Boolean);
    expect(labels).toContain("New Project...");
    expect(labels).toContain("Open Project...");
    expect(fileSubmenu.find((i) => i.label === "New Project...")?.accelerator).toBe("CmdOrCtrl+N");
    expect(fileSubmenu.find((i) => i.label === "Open Project...")?.accelerator).toBe("CmdOrCtrl+O");
  });

  it("View menu exposes Reload, ForceReload, and toggle DevTools", () => {
    const template = buildMenuTemplate({
      platform: "darwin",
      send: vi.fn(),
      openExternal: vi.fn(),
    });
    const viewSubmenu = template[3]?.submenu as Array<{ role?: string; accelerator?: string }>;
    const roles = viewSubmenu.map((item) => item.role).filter(Boolean);
    expect(roles).toContain("reload");
    expect(roles).toContain("forceReload");
    expect(roles).toContain("toggleDevTools");
    expect(viewSubmenu.find((i) => i.role === "toggleDevTools")?.accelerator).toBe(
      "Alt+CmdOrCtrl+I",
    );
  });

  it("Window menu exposes minimize / zoom / close on macOS", () => {
    const template = buildMenuTemplate({
      platform: "darwin",
      send: vi.fn(),
      openExternal: vi.fn(),
    });
    const windowSubmenu = template[4]?.submenu as Array<{ role?: string }>;
    const roles = windowSubmenu.map((item) => item.role).filter(Boolean);
    for (const role of ["minimize", "zoom", "close", "front"]) {
      expect(roles).toContain(role);
    }
  });

  it("Help menu opens GitHub Repository and Report Issue externally", () => {
    const openExternal = vi.fn();
    const template = buildMenuTemplate({
      platform: "darwin",
      send: vi.fn(),
      openExternal,
    });
    const helpSubmenu = template[5]?.submenu as Array<{ label?: string; click?: () => void }>;
    helpSubmenu.find((i) => i.label === "GitHub Repository")?.click?.();
    helpSubmenu.find((i) => i.label === "Report Issue")?.click?.();
    expect(openExternal).toHaveBeenCalledWith("https://github.com/wavyrai/tmux-ide");
    expect(openExternal).toHaveBeenCalledWith("https://github.com/wavyrai/tmux-ide/issues");
  });

  it("non-macOS platforms still expose Reload + DevTools under View", () => {
    const template = buildMenuTemplate({
      platform: "linux",
      send: vi.fn(),
      openExternal: vi.fn(),
    });
    // On linux the View menu is the second item (File, View, Help).
    const viewSubmenu = template[1]?.submenu as Array<{ role?: string }>;
    const roles = viewSubmenu.map((item) => item.role).filter(Boolean);
    expect(roles).toContain("reload");
    expect(roles).toContain("toggleDevTools");
  });
});
