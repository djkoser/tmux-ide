import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GlobalListener = (frame: { type: string; [k: string]: unknown }) => void;
const globalListeners: GlobalListener[] = [];

// Mock the WS bus once at module load. Mirror the projectStore.test pattern
// so that resetting modules between tests doesn't reset the listener
// registry — the bridge re-attaches via subscribeGlobal each time anyway.
vi.mock("../wsBus", () => ({
  subscribeGlobal: (listener: GlobalListener) => {
    globalListeners.push(listener);
    return () => {
      const idx = globalListeners.indexOf(listener);
      if (idx >= 0) globalListeners.splice(idx, 1);
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  globalListeners.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  const mod = await import("../actionEventBus");
  // Reset the singleton between tests so refcount + listener registration
  // don't leak across cases.
  mod.__resetActionEventBridgeForTests();
  // Re-clear our captured listeners — the reset above released the bridge's
  // global subscription, so the listeners array should be empty at the
  // start of every test.
  globalListeners.length = 0;
  return mod;
}

function captureWindowEvents(name: string): { detail: unknown }[] {
  const captured: { detail: unknown }[] = [];
  const handler = (event: Event) => {
    captured.push({ detail: (event as CustomEvent).detail });
  };
  window.addEventListener(name, handler);
  // Returning the array; teardown is per-test via afterEach below if needed.
  // For these tests every test creates its own captured-array so we don't
  // need to detach (the listener is harmless after the assertion).
  return captured;
}

describe("actionEventBus", () => {
  it("subscribes to the global WS bus on first acquire", async () => {
    const mod = await load();
    expect(globalListeners).toHaveLength(0);
    const release = mod.enableActionEventBridge();
    expect(globalListeners).toHaveLength(1);
    release();
    expect(globalListeners).toHaveLength(0);
  });

  it("dispatches tmux-ide:action.complete on action.complete frames", async () => {
    const mod = await load();
    const captured = captureWindowEvents(mod.ACTION_COMPLETE_EVENT);
    const release = mod.enableActionEventBridge();

    expect(globalListeners).toHaveLength(1);
    const listener = globalListeners[0]!;
    listener({ type: "action.complete", name: "task.create", result: { id: "001" } });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.detail).toEqual({
      name: "task.create",
      result: { id: "001" },
    });

    release();
  });

  it("dispatches tmux-ide:config.changed on config.changed frames", async () => {
    const mod = await load();
    const captured = captureWindowEvents(mod.CONFIG_CHANGED_EVENT);
    const release = mod.enableActionEventBridge();

    const listener = globalListeners[0]!;
    listener({ type: "config.changed", sessionName: "alpha" });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.detail).toEqual({ sessionName: "alpha" });

    release();
  });

  it("ignores frames it doesn't care about", async () => {
    const mod = await load();
    const actionCaptured = captureWindowEvents(mod.ACTION_COMPLETE_EVENT);
    const configCaptured = captureWindowEvents(mod.CONFIG_CHANGED_EVENT);
    const release = mod.enableActionEventBridge();

    const listener = globalListeners[0]!;
    listener({ type: "task.changed", sessionName: "alpha" });
    listener({ type: "sessions.changed" });
    listener({ type: "pong" });

    expect(actionCaptured).toHaveLength(0);
    expect(configCaptured).toHaveLength(0);

    release();
  });

  it("ignores malformed frames missing required fields", async () => {
    const mod = await load();
    const actionCaptured = captureWindowEvents(mod.ACTION_COMPLETE_EVENT);
    const configCaptured = captureWindowEvents(mod.CONFIG_CHANGED_EVENT);
    const release = mod.enableActionEventBridge();

    const listener = globalListeners[0]!;
    // Missing `name` — should not dispatch.
    listener({ type: "action.complete", result: {} });
    // Missing `sessionName` — should not dispatch.
    listener({ type: "config.changed" });

    expect(actionCaptured).toHaveLength(0);
    expect(configCaptured).toHaveLength(0);

    release();
  });

  it("refcounts: second acquire reuses one bus subscription, last release detaches", async () => {
    const mod = await load();
    const release1 = mod.enableActionEventBridge();
    const release2 = mod.enableActionEventBridge();
    expect(globalListeners).toHaveLength(1);

    release1();
    expect(globalListeners).toHaveLength(1);

    release2();
    expect(globalListeners).toHaveLength(0);
  });

  it("release is idempotent — calling twice doesn't double-detach", async () => {
    const mod = await load();
    const release1 = mod.enableActionEventBridge();
    const release2 = mod.enableActionEventBridge();
    expect(globalListeners).toHaveLength(1);

    release1();
    release1(); // double-release on the same handle
    expect(globalListeners).toHaveLength(1); // still attached for release2

    release2();
    expect(globalListeners).toHaveLength(0);
  });

  it("re-acquire after teardown opens a fresh subscription", async () => {
    const mod = await load();
    const release1 = mod.enableActionEventBridge();
    expect(globalListeners).toHaveLength(1);
    release1();
    expect(globalListeners).toHaveLength(0);

    const release2 = mod.enableActionEventBridge();
    expect(globalListeners).toHaveLength(1);
    release2();
  });
});
