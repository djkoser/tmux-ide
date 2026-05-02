import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetLayoutStateForTests, useLayoutState } from "./useLayoutState";

beforeEach(() => {
  window.localStorage.clear();
  __resetLayoutStateForTests({
    terminalOpen: false,
    activeTabIdByProject: {},
    tabs: [],
  });
});

function readPersisted() {
  const raw = window.localStorage.getItem("tmux-ide.layout.v2");
  return raw ? (JSON.parse(raw) as unknown) : null;
}

describe("useLayoutState", () => {
  it("starts closed and creates a tab whose project becomes active", () => {
    const { result } = renderHook(() => useLayoutState());

    expect(result.current.terminalOpen).toBe(false);
    expect(result.current.activeTabIdByProject).toEqual({});
    expect(result.current.tabs).toEqual([]);

    let tab: ReturnType<typeof result.current.newTab> | undefined;
    act(() => {
      tab = result.current.newTab("alpha");
    });

    expect(tab).toEqual({ id: "alpha:1", title: "alpha 1", projectName: "alpha" });
    expect(result.current.terminalOpen).toBe(true);
    expect(result.current.getActiveTabId("alpha")).toBe("alpha:1");
    expect(result.current.tabs).toEqual([tab]);
    expect(readPersisted()).toEqual({
      activeTabIdByProject: { alpha: "alpha:1" },
      tabs: [tab],
    });
  });

  it("supports custom titles and per-project id sequences", () => {
    const { result } = renderHook(() => useLayoutState());

    act(() => {
      result.current.newTab("alpha", "Shell");
      result.current.newTab("beta");
      result.current.newTab("alpha");
    });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(["alpha:1", "beta:1", "alpha:2"]);
    expect(result.current.tabs[0]?.title).toBe("Shell");
    expect(result.current.tabs[2]?.title).toBe("alpha 2");
    expect(result.current.getActiveTabId("alpha")).toBe("alpha:2");
    expect(result.current.getActiveTabId("beta")).toBe("beta:1");
  });

  it("scopes active tab per project — switching projects restores their own focused tab", () => {
    const { result } = renderHook(() => useLayoutState());

    act(() => {
      result.current.newTab("alpha");
      result.current.newTab("beta");
      result.current.setActiveTab("alpha", "alpha:1");
    });

    expect(result.current.getActiveTabId("alpha")).toBe("alpha:1");
    expect(result.current.getActiveTabId("beta")).toBe("beta:1");

    expect(result.current.getProjectTabs("alpha").map((t) => t.id)).toEqual(["alpha:1"]);
    expect(result.current.getProjectTabs("beta").map((t) => t.id)).toEqual(["beta:1"]);
  });

  it("opens, closes, and toggles terminal mode without persisting terminalOpen", () => {
    const { result } = renderHook(() => useLayoutState());

    act(() => {
      result.current.openTerminalMode();
    });
    expect(result.current.terminalOpen).toBe(true);
    expect(readPersisted()).toBeNull();

    act(() => {
      result.current.toggleTerminal();
    });
    expect(result.current.terminalOpen).toBe(false);

    act(() => {
      result.current.closeTerminalMode();
    });
    expect(result.current.terminalOpen).toBe(false);
  });

  it("ignores setActiveTab when the tab does not belong to the project", () => {
    const { result } = renderHook(() => useLayoutState());

    act(() => {
      result.current.newTab("alpha");
      result.current.newTab("beta");
      result.current.setActiveTab("alpha", "beta:1");
    });

    expect(result.current.getActiveTabId("alpha")).toBe("alpha:1");
    expect(result.current.getActiveTabId("beta")).toBe("beta:1");

    act(() => {
      result.current.setActiveTab("alpha", "missing:1");
    });
    expect(result.current.getActiveTabId("alpha")).toBe("alpha:1");
  });

  it("closes active tabs with same-project fallthrough and closes mode after the last tab", () => {
    const { result } = renderHook(() => useLayoutState());

    act(() => {
      result.current.newTab("alpha"); // alpha:1
      result.current.newTab("alpha"); // alpha:2
      result.current.newTab("beta"); // beta:1
      result.current.setActiveTab("alpha", "alpha:1");
      result.current.closeTab("alpha:1");
    });

    // Active falls through to the next alpha tab, not beta:1.
    expect(result.current.getActiveTabId("alpha")).toBe("alpha:2");
    expect(result.current.getActiveTabId("beta")).toBe("beta:1");
    expect(result.current.terminalOpen).toBe(true);

    act(() => {
      result.current.closeTab("alpha:2");
      result.current.closeTab("beta:1");
    });

    expect(result.current.tabs).toEqual([]);
    expect(result.current.getActiveTabId("alpha")).toBeNull();
    expect(result.current.terminalOpen).toBe(false);
  });

  it("reorders known tab ids and appends omitted tabs", () => {
    const { result } = renderHook(() => useLayoutState());

    act(() => {
      result.current.newTab("alpha");
      result.current.newTab("beta");
      result.current.newTab("gamma");
      result.current.reorderTabs(["gamma:1", "alpha:1"]);
    });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(["gamma:1", "alpha:1", "beta:1"]);
  });

  it("loads persisted tabs but defaults terminalOpen to false", () => {
    const persisted = {
      activeTabIdByProject: { alpha: "alpha:1", beta: "beta:1" },
      tabs: [
        { id: "alpha:1", title: "alpha 1", projectName: "alpha" },
        { id: "beta:1", title: "beta 1", projectName: "beta" },
      ],
    };
    window.localStorage.setItem("tmux-ide.layout.v2", JSON.stringify(persisted));
    __resetLayoutStateForTests();

    const { result } = renderHook(() => useLayoutState());

    expect(result.current.terminalOpen).toBe(false);
    expect(result.current.getActiveTabId("alpha")).toBe("alpha:1");
    expect(result.current.getActiveTabId("beta")).toBe("beta:1");
    expect(result.current.tabs).toEqual(persisted.tabs);
  });

  it("migrates legacy v1 single activeTabId into the per-project map", () => {
    const legacy = {
      activeTabId: "alpha:1",
      tabs: [
        { id: "alpha:1", title: "alpha 1", projectName: "alpha" },
        { id: "beta:1", title: "beta 1", projectName: "beta" },
      ],
    };
    window.localStorage.setItem("tmux-ide.layout.v1", JSON.stringify(legacy));
    __resetLayoutStateForTests();

    const { result } = renderHook(() => useLayoutState());

    expect(result.current.tabs.map((t) => t.id)).toEqual(["alpha:1", "beta:1"]);
    expect(result.current.getActiveTabId("alpha")).toBe("alpha:1");
    // beta had no legacy active assignment, so it falls back to first beta tab.
    expect(result.current.getActiveTabId("beta")).toBe("beta:1");
  });
});
