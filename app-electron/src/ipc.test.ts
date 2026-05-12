import { describe, expect, it, vi } from "vitest";
import {
  APP_UPDATE_CHECK_CHANNEL,
  APP_UPDATE_STATUS_CHANNEL,
  MENU_EVENT_CHANNELS,
  isMenuEventChannel,
  sendMenuEvent,
} from "./ipc.ts";

describe("ipc channel constants", () => {
  it("MENU_EVENT_CHANNELS is the closed set the renderer recognises", () => {
    expect([...MENU_EVENT_CHANNELS].sort()).toEqual(
      ["menu:add-project", "menu:open-settings"].sort(),
    );
  });

  it("update channels match the renderer/preload contract", () => {
    expect(APP_UPDATE_CHECK_CHANNEL).toBe("app:check-for-updates");
    expect(APP_UPDATE_STATUS_CHANNEL).toBe("app:update-status");
  });
});

describe("isMenuEventChannel", () => {
  it("accepts each known channel", () => {
    for (const channel of MENU_EVENT_CHANNELS) {
      expect(isMenuEventChannel(channel)).toBe(true);
    }
  });

  it("rejects free-form strings", () => {
    expect(isMenuEventChannel("menu:nope")).toBe(false);
    expect(isMenuEventChannel("")).toBe(false);
    expect(isMenuEventChannel("app:update-status")).toBe(false);
  });
});

describe("sendMenuEvent", () => {
  it("forwards to webContents.send when the window exists", () => {
    const send = vi.fn();
    sendMenuEvent({ webContents: { send } } as never, "menu:add-project");
    expect(send).toHaveBeenCalledWith("menu:add-project");
  });

  it("is a safe no-op when the window is null or undefined", () => {
    expect(() => sendMenuEvent(null, "menu:add-project")).not.toThrow();
    expect(() => sendMenuEvent(undefined, "menu:open-settings")).not.toThrow();
  });
});
