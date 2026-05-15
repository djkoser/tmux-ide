/**
 * Open-in picker — wire coverage. Covers:
 *
 *   1. Primary button reflects the preferred editor + falls back to
 *      the first available when preferred is null / not available.
 *   2. Clicking primary fires onOpenInEditor + onPreferredEditorChange
 *      with the resolved editor id.
 *   3. The chevron opens a menu that lists only the available editors,
 *      with preferred-row decoration.
 *   4. Menu rows dispatch onOpenInEditor + onPreferredEditorChange for
 *      the picked editor.
 *   5. Empty-state placeholder when no editors are detected.
 *   6. Primary button stays disabled when no cwd is supplied.
 *   7. Favorite shortcut label renders alongside the preferred row.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { OpenInPicker, type EditorId } from "../src/components/OpenInPicker";

afterEach(() => {
  document.body.innerHTML = "";
});

interface MountOpts {
  available?: EditorId[];
  preferred?: EditorId | null;
  cwd?: string | null;
  shortcutLabel?: string | null;
}

function mount(opts: MountOpts = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const [available] = createSignal<ReadonlyArray<EditorId>>(
    opts.available ?? ["cursor", "vscode", "zed"],
  );
  const [preferred] = createSignal<EditorId | null>(opts.preferred ?? "vscode");
  const [cwd] = createSignal<string | null>("cwd" in opts ? (opts.cwd ?? null) : "/tmp/project");
  const [shortcut] = createSignal<string | null>(opts.shortcutLabel ?? null);

  const onOpenInEditor = vi.fn();
  const onPreferredEditorChange = vi.fn();

  const dispose = render(
    () => (
      <OpenInPicker
        availableEditors={available}
        preferredEditor={preferred}
        openInCwd={cwd}
        onOpenInEditor={onOpenInEditor}
        onPreferredEditorChange={onPreferredEditorChange}
        favoriteShortcutLabel={() => shortcut()}
      />
    ),
    container,
  );

  return { container, dispose, onOpenInEditor, onPreferredEditorChange };
}

describe("OpenInPicker", () => {
  it("reflects the preferred editor on the primary button", () => {
    const { container, dispose } = mount({ preferred: "zed" });
    const primary = container.querySelector("[data-testid='open-in-picker-primary']");
    expect(primary?.getAttribute("data-editor-id")).toBe("zed");
    expect(primary?.textContent).toContain("Zed");
    dispose();
  });

  it("falls back to the first available editor when preferred is unavailable", () => {
    const { container, dispose } = mount({
      preferred: "kiro",
      available: ["cursor", "vscode"],
    });
    const primary = container.querySelector("[data-testid='open-in-picker-primary']");
    expect(primary?.getAttribute("data-editor-id")).toBe("cursor");
    dispose();
  });

  it("disables the primary button when there is no cwd", () => {
    const { container, dispose } = mount({ cwd: null });
    const primary = container.querySelector<HTMLButtonElement>(
      "[data-testid='open-in-picker-primary']",
    );
    expect(primary!.disabled).toBe(true);
    dispose();
  });

  it("dispatches onOpenInEditor + onPreferredEditorChange on primary click", () => {
    const { container, dispose, onOpenInEditor, onPreferredEditorChange } = mount({
      preferred: "vscode",
    });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-primary']")!.click();
    expect(onOpenInEditor).toHaveBeenCalledExactlyOnceWith("vscode", "/tmp/project");
    expect(onPreferredEditorChange).toHaveBeenCalledExactlyOnceWith("vscode");
    dispose();
  });

  it("opens the menu via the chevron and lists only available editors", () => {
    const { container, dispose } = mount({ available: ["cursor", "zed"] });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    const options = container.querySelectorAll("[data-testid='open-in-picker-option']");
    expect(Array.from(options).map((o) => o.getAttribute("data-editor-id"))).toEqual([
      "cursor",
      "zed",
    ]);
    dispose();
  });

  it("dispatches both callbacks on menu row click", () => {
    const { container, dispose, onOpenInEditor, onPreferredEditorChange } = mount({
      preferred: "vscode",
      available: ["vscode", "cursor"],
    });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    container
      .querySelector<HTMLButtonElement>(
        "[data-testid='open-in-picker-option'][data-editor-id='cursor']",
      )!
      .click();
    expect(onOpenInEditor).toHaveBeenCalledExactlyOnceWith("cursor", "/tmp/project");
    expect(onPreferredEditorChange).toHaveBeenCalledExactlyOnceWith("cursor");
    dispose();
  });

  it("marks the preferred row with data-preferred='true'", () => {
    const { container, dispose } = mount({ preferred: "cursor", available: ["cursor", "vscode"] });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    const preferred = container.querySelector(
      "[data-testid='open-in-picker-option'][data-preferred='true']",
    );
    expect(preferred?.getAttribute("data-editor-id")).toBe("cursor");
    dispose();
  });

  it("shows the favorite shortcut label next to the preferred row", () => {
    const { container, dispose } = mount({
      preferred: "vscode",
      shortcutLabel: "⌘E",
    });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    const kbd = container.querySelector("[data-testid='open-in-picker-shortcut']");
    expect(kbd?.textContent).toBe("⌘E");
    dispose();
  });

  it("renders the empty-state placeholder when no editors are detected", () => {
    const { container, dispose } = mount({ available: [], preferred: null });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    expect(container.querySelector("[data-testid='open-in-picker-empty']")).toBeTruthy();
    dispose();
  });
});
