/**
 * Wire-coverage for CommandPaletteBridge (T1).
 *
 * The bridge's onSelect handler routes per-category. Each branch fires
 * a different wire:
 *   - views        → CustomEvent("tmuxide.palette-select-view")
 *   - skills       → fire view event + push ?skill=NAME
 *   - tasks        → fire view event + push ?task=ID
 *   - threads      → fire view event + push ?thread=ID
 *   - providers    → fire view event ("costs")
 *   - commands     → runAction(id)
 * All branches also call closeCommandPalette() first.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";

const spies = vi.hoisted(() => ({
  closeCommandPalette: vi.fn(),
  runAction: vi.fn(),
}));

vi.mock("@/components/CommandPalette", () => ({
  closeCommandPalette: spies.closeCommandPalette,
  getPaletteSnapshot: () => false,
  subscribePalette: () => () => undefined,
}));

vi.mock("@/lib/actions", () => ({
  useActions: () => [],
  runAction: spies.runAction,
}));

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

import { CommandPaletteBridge } from "@/components/command-palette-bridge";

interface PaletteCaptured {
  onSelect?: (category: string, id: string) => void;
  onDismiss?: () => void;
}

const VIEW_EVENT = "tmuxide.palette-select-view";

beforeEach(() => {
  clearCaptures();
  spies.closeCommandPalette.mockClear();
  spies.runAction.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function listenForViewEvent(): { events: CustomEvent[]; release: () => void } {
  const events: CustomEvent[] = [];
  const listener = (e: Event) => events.push(e as CustomEvent);
  window.addEventListener(VIEW_EVENT, listener);
  return {
    events,
    release: () => window.removeEventListener(VIEW_EVENT, listener),
  };
}

describe("CommandPaletteBridge — wire", () => {
  it("views category fires the view-select CustomEvent", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    const { events, release } = listenForViewEvent();
    try {
      opts.onSelect!("views", "kanban");
      expect(spies.closeCommandPalette).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toBe("kanban");
    } finally {
      release();
    }
  });

  it("skills category fires view-event + pushes ?skill= to the URL", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    const { events, release } = listenForViewEvent();
    try {
      opts.onSelect!("skills", "reviewer");
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toBe("skills");
      expect(window.location.search).toContain("skill=reviewer");
    } finally {
      release();
    }
  });

  it("tasks category fires view-event + pushes ?task= to the URL", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    const { events, release } = listenForViewEvent();
    try {
      opts.onSelect!("tasks", "t-9");
      expect(events[0]!.detail).toBe("kanban");
      expect(window.location.search).toContain("task=t-9");
    } finally {
      release();
    }
  });

  it("threads category fires view-event + pushes ?thread= to the URL", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    const { events, release } = listenForViewEvent();
    try {
      opts.onSelect!("threads", "thr-2");
      expect(events[0]!.detail).toBe("chat");
      expect(window.location.search).toContain("thread=thr-2");
    } finally {
      release();
    }
  });

  it("providers category fires view-event for costs view", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    const { events, release } = listenForViewEvent();
    try {
      opts.onSelect!("providers", "openai");
      expect(events[0]!.detail).toBe("costs");
    } finally {
      release();
    }
  });

  it("commands category dispatches runAction with the action id", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    opts.onSelect!("commands", "open-settings");
    expect(spies.runAction).toHaveBeenCalledWith("open-settings");
  });

  it("onDismiss closes the palette via the shared store", async () => {
    mockFetchOk();
    render(<CommandPaletteBridge projectName="proj" />);
    const opts = await waitForCapture<PaletteCaptured>("CommandPalette");
    opts.onDismiss!();
    expect(spies.closeCommandPalette).toHaveBeenCalledTimes(1);
  });
});
