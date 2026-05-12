import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAddProjectDialogStoreForTests,
  useAddProjectDialog,
} from "../addProjectDialogStore";
import {
  __resetMenuBridgeForTests,
  useFirstRunProjectPrompt,
  useMenuBridge,
  type MenuBridgeChannel,
} from "../menuBridge";
import { __resetNavigationForTests, getNavigationLive } from "../navigation";

let handlers: Partial<Record<MenuBridgeChannel, () => void>>;

beforeEach(() => {
  handlers = {};
  __resetAddProjectDialogStoreForTests();
  __resetMenuBridgeForTests();
  __resetNavigationForTests({ type: "overview" });
  window.__TMUX_IDE__ = {
    port: 6060,
    version: "test",
    apiBaseUrl: "http://127.0.0.1:6060",
    wsUrl: "ws://127.0.0.1:6060/ws/events",
    on: (channel, handler) => {
      handlers[channel] = handler;
      return () => {
        delete handlers[channel];
      };
    },
  };
});

afterEach(() => {
  delete window.__TMUX_IDE__;
  vi.restoreAllMocks();
});

describe("useMenuBridge", () => {
  it("opens the AddProjectDialog from the menu:add-project event", async () => {
    const dialog = renderHook(() => useAddProjectDialog());
    renderHook(() => useMenuBridge());

    act(() => handlers["menu:add-project"]?.());

    await waitFor(() => expect(dialog.result.current.open).toBe(true));
  });

  it("opens the Settings tab from the menu:open-settings event", () => {
    renderHook(() => useMenuBridge());

    act(() => handlers["menu:open-settings"]?.());

    expect(getNavigationLive()).toEqual({ type: "settings", section: "general" });
  });
});

describe("useFirstRunProjectPrompt", () => {
  it("opens once when the initial project fetch completes empty", async () => {
    const openDialog = vi.fn();
    const { rerender } = renderHook(
      ({ loading, projectCount }) =>
        useFirstRunProjectPrompt({ loading, projectCount, openDialog }),
      { initialProps: { loading: true, projectCount: 0 } },
    );

    expect(openDialog).not.toHaveBeenCalled();

    rerender({ loading: false, projectCount: 0 });
    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));

    rerender({ loading: false, projectCount: 0 });
    expect(openDialog).toHaveBeenCalledTimes(1);
  });
});
