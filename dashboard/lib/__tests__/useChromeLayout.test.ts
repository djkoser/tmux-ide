/**
 * useChromeLayout — store-level tests. No React rendering; we hit the
 * imperative actions directly and assert the module-local state +
 * localStorage persistence.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetChromeLayoutForTests,
  getChromeLayoutSnapshot,
  setBottomPanelOpen,
  setLeftSidebarOpen,
  setRightInspectorOpen,
  toggleBottomPanel,
  toggleLeftSidebar,
  toggleRightInspector,
} from "../useChromeLayout";

const STORAGE_KEY = "tmux-ide.v2.chrome.v1";

beforeEach(() => {
  __resetChromeLayoutForTests();
});

afterEach(() => {
  __resetChromeLayoutForTests();
});

describe("useChromeLayout store", () => {
  it("starts with all three regions open by default", () => {
    const snap = getChromeLayoutSnapshot();
    expect(snap.leftSidebarOpen).toBe(true);
    expect(snap.rightInspectorOpen).toBe(true);
    expect(snap.bottomPanelOpen).toBe(true);
  });

  it("toggleLeftSidebar flips the boolean and persists to localStorage", () => {
    toggleLeftSidebar();
    expect(getChromeLayoutSnapshot().leftSidebarOpen).toBe(false);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).leftSidebarOpen).toBe(false);
    // Flipping back round-trips.
    toggleLeftSidebar();
    expect(getChromeLayoutSnapshot().leftSidebarOpen).toBe(true);
  });

  it("each toggle action only affects its own region", () => {
    toggleRightInspector();
    const snap1 = getChromeLayoutSnapshot();
    expect(snap1.leftSidebarOpen).toBe(true);
    expect(snap1.rightInspectorOpen).toBe(false);
    expect(snap1.bottomPanelOpen).toBe(true);

    toggleBottomPanel();
    const snap2 = getChromeLayoutSnapshot();
    expect(snap2.leftSidebarOpen).toBe(true);
    expect(snap2.rightInspectorOpen).toBe(false);
    expect(snap2.bottomPanelOpen).toBe(false);
  });

  it("setLeftSidebarOpen is idempotent and skips persist when value is unchanged", () => {
    setLeftSidebarOpen(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    setLeftSidebarOpen(false);
    expect(getChromeLayoutSnapshot().leftSidebarOpen).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it("setRightInspectorOpen + setBottomPanelOpen drive their regions explicitly", () => {
    setRightInspectorOpen(false);
    setBottomPanelOpen(false);
    const snap = getChromeLayoutSnapshot();
    expect(snap.rightInspectorOpen).toBe(false);
    expect(snap.bottomPanelOpen).toBe(false);
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(persisted).toMatchObject({
      leftSidebarOpen: true,
      rightInspectorOpen: false,
      bottomPanelOpen: false,
    });
  });
});
