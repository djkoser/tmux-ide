import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useChromeShortcuts } from "@/lib/useChromeShortcuts";
import {
  __resetChromeLayoutForTests,
  getChromeLayoutSnapshot,
} from "@/lib/useChromeLayout";

function Host() {
  useChromeShortcuts();
  return null;
}

function press(
  key: string,
  modifiers: { meta?: boolean; alt?: boolean; ctrl?: boolean } = {},
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

beforeEach(() => {
  __resetChromeLayoutForTests();
});

afterEach(() => {
  cleanup();
});

describe("useChromeShortcuts", () => {
  it("Cmd+B toggles the left sidebar", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().leftSidebarOpen;
    press("b", { meta: true });
    expect(getChromeLayoutSnapshot().leftSidebarOpen).toBe(!before);
  });

  it("Cmd+J toggles the bottom panel", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().bottomPanelOpen;
    press("j", { meta: true });
    expect(getChromeLayoutSnapshot().bottomPanelOpen).toBe(!before);
  });

  it("Cmd+Alt+B toggles the right inspector (VSCode default)", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().rightInspectorOpen;
    press("b", { meta: true, alt: true });
    expect(getChromeLayoutSnapshot().rightInspectorOpen).toBe(!before);
  });

  it("Cmd+I toggles the right inspector (WN5 mnemonic alias)", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().rightInspectorOpen;
    press("i", { meta: true });
    expect(getChromeLayoutSnapshot().rightInspectorOpen).toBe(!before);
  });

  it("Cmd+I and Cmd+Alt+B drive the same state — pressing both flips twice", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().rightInspectorOpen;
    press("i", { meta: true });
    press("b", { meta: true, alt: true });
    expect(getChromeLayoutSnapshot().rightInspectorOpen).toBe(before);
  });

  it("does not fire any toggle while focus is in an editable element", () => {
    render(<Host />);
    const beforeLeft = getChromeLayoutSnapshot().leftSidebarOpen;
    const beforeRight = getChromeLayoutSnapshot().rightInspectorOpen;
    const beforeBottom = getChromeLayoutSnapshot().bottomPanelOpen;
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        metaKey: true,
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "i",
        metaKey: true,
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "j",
        metaKey: true,
        bubbles: true,
      }),
    );
    input.remove();
    expect(getChromeLayoutSnapshot().leftSidebarOpen).toBe(beforeLeft);
    expect(getChromeLayoutSnapshot().rightInspectorOpen).toBe(beforeRight);
    expect(getChromeLayoutSnapshot().bottomPanelOpen).toBe(beforeBottom);
  });

  it("ignores Cmd+i without modifier (plain 'i' key)", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().rightInspectorOpen;
    press("i", { meta: false });
    expect(getChromeLayoutSnapshot().rightInspectorOpen).toBe(before);
  });

  it("Cmd+Alt+I is not bound (only Cmd+I + Cmd+Alt+B are inspector hotkeys)", () => {
    render(<Host />);
    const before = getChromeLayoutSnapshot().rightInspectorOpen;
    press("i", { meta: true, alt: true });
    // Cmd+Alt+I falls into the `event.altKey ? return : ...` guard and
    // doesn't fire the I branch (we only handle alt+B). State stays put.
    expect(getChromeLayoutSnapshot().rightInspectorOpen).toBe(before);
  });
});
