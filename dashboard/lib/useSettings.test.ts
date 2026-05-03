import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSettingsForTests,
  defaultSettings,
  getEffectiveKeybind,
  useSettings,
} from "./useSettings";

beforeEach(() => {
  window.localStorage.clear();
  __resetSettingsForTests();
});

function readPersisted() {
  const raw = window.localStorage.getItem("tmux-ide.settings.v1");
  return raw ? (JSON.parse(raw) as unknown) : null;
}

describe("useSettings", () => {
  it("updates and persists terminal settings", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setTerminal({ fontSize: 18, scrollback: 60000, cursorBlink: false });
    });

    expect(result.current.terminal).toEqual({
      fontSize: 18,
      scrollback: 50000,
      cursorBlink: false,
    });
    expect(readPersisted()).toMatchObject({
      terminal: { fontSize: 18, scrollback: 50000, cursorBlink: false },
    });
  });

  it("applies selected theme to the html data-theme attribute", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setThemeId("catppuccin");
    });

    expect(document.documentElement.dataset.theme).toBe("catppuccin");
    expect(result.current.themeId).toBe("catppuccin");
  });

  it("sets and resets keybind overrides", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setKeybindOverride("toggle-terminal", "Mod+Shift+Y");
    });
    expect(getEffectiveKeybind("toggle-terminal", "Mod+j")).toBe("Mod+Shift+Y");

    act(() => {
      result.current.resetKeybind("toggle-terminal");
    });
    expect(getEffectiveKeybind("toggle-terminal", "Mod+j")).toBe("Mod+j");
  });

  it("resets all settings to defaults", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setThemeId("dracula");
      result.current.resetAll();
    });

    expect(result.current.themeId).toBe(defaultSettings.themeId);
    expect(document.documentElement.dataset.theme).toBe(defaultSettings.themeId);
  });
});
