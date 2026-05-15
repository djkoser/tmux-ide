/**
 * ChatHeader mounts the OpenInPicker chip whenever the thread has
 * a project directory. Host-supplied props (`availableEditors`,
 * `preferredEditor`, `openInCwd`, `onOpenInEditor`,
 * `onPreferredEditorChange`) override the built-in defaults; the
 * defaults are good enough to surface the chip on any thread that
 * carries a `projectDir`. A small folder chip (`VscodeEntryIcon`)
 * sits next to the picker as a "what folder will I open" hint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { ChatHeader } from "../src/components/ChatHeader";
import type { EditorId } from "../src/components/OpenInPicker";
import type { ThreadState } from "../src/types";

const PREFERRED_EDITOR_STORAGE_KEY = "chat-solid:open-in:preferred-editor";

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(PREFERRED_EDITOR_STORAGE_KEY);
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

function thread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    id: "t1",
    title: "First chat",
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    provider: { kind: "claude-code" },
    messages: [],
    ...overrides,
  };
}

interface MountOpts {
  threadOverrides?: Partial<ThreadState>;
  withHostOpenIn?: boolean;
  available?: EditorId[];
  preferred?: EditorId | null;
  cwd?: string | null;
}

function mount(opts: MountOpts = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const [t] = createSignal<ThreadState | null>(thread(opts.threadOverrides));
  const [inflight] = createSignal(false);
  const [stopReason] = createSignal<null>(null);
  const [usage] = createSignal<null>(null);
  const [session] = createSignal<string | null>("alpha");
  const [editors] = createSignal<ReadonlyArray<EditorId>>(opts.available ?? ["cursor", "vscode"]);
  const [preferred] = createSignal<EditorId | null>(opts.preferred ?? "vscode");
  const [cwd] = createSignal<string | null>(opts.cwd ?? "/tmp/project");

  const onOpenInEditor = vi.fn();
  const onPreferredEditorChange = vi.fn();

  const dispose = render(
    () => (
      <ChatHeader
        thread={t}
        inflight={inflight}
        stopReason={stopReason}
        usage={usage}
        sessionName={session}
        onCancel={vi.fn()}
        onRename={vi.fn(async () => undefined)}
        availableEditors={opts.withHostOpenIn ? editors : undefined}
        preferredEditor={opts.withHostOpenIn ? preferred : undefined}
        openInCwd={opts.withHostOpenIn ? cwd : undefined}
        onOpenInEditor={opts.withHostOpenIn ? onOpenInEditor : undefined}
        onPreferredEditorChange={opts.withHostOpenIn ? onPreferredEditorChange : undefined}
      />
    ),
    container,
  );

  return { container, dispose, onOpenInEditor, onPreferredEditorChange };
}

describe("ChatHeader — OpenInPicker mount", () => {
  it("hides the chip when neither the host nor the thread provides a cwd", () => {
    const { container, dispose } = mount();
    expect(container.querySelector("[data-testid='open-in-picker']")).toBeNull();
    expect(container.querySelector("[data-testid='chat-header-cwd-chip']")).toBeNull();
    dispose();
  });

  it("mounts the chip with built-in defaults when the thread carries a projectDir", () => {
    const { container, dispose } = mount({
      threadOverrides: { projectDir: "/tmp/my-project" },
    });
    const picker = container.querySelector("[data-testid='open-in-picker']");
    expect(picker).toBeTruthy();
    // CWD hint chip surfaces the basename of the project dir.
    const chip = container.querySelector("[data-testid='chat-header-cwd-chip']");
    expect(chip?.textContent).toContain("my-project");
    // Open the menu via the chevron — internal default registry has
    // vscode / cursor / vscode-insiders / vscodium / zed / file-manager.
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    const options = container.querySelectorAll("[data-testid='open-in-picker-option']");
    expect(options.length).toBeGreaterThanOrEqual(5);
    dispose();
  });

  it("uses a localStorage-persisted preferred editor when set", () => {
    localStorage.setItem(PREFERRED_EDITOR_STORAGE_KEY, "zed");
    const { container, dispose } = mount({
      threadOverrides: { projectDir: "/tmp/my-project" },
    });
    expect(
      container
        .querySelector("[data-testid='open-in-picker-primary']")
        ?.getAttribute("data-editor-id"),
    ).toBe("zed");
    dispose();
  });

  it("writes the picked editor to localStorage when no host handler is wired", () => {
    const { container, dispose } = mount({
      threadOverrides: { projectDir: "/tmp/my-project" },
    });
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-chevron']")!.click();
    container
      .querySelector<HTMLButtonElement>(
        "[data-testid='open-in-picker-option'][data-editor-id='cursor']",
      )!
      .click();
    expect(localStorage.getItem(PREFERRED_EDITOR_STORAGE_KEY)).toBe("cursor");
    dispose();
  });

  it("opens the editor URL scheme via window.open when no host handler is wired", () => {
    const opened: string[] = [];
    const originalOpen = window.open;
    window.open = vi.fn(((url) => {
      opened.push(typeof url === "string" ? url : (url?.toString() ?? ""));
      return null;
    }) as typeof window.open);
    try {
      const { container, dispose } = mount({
        threadOverrides: { projectDir: "/tmp/my-project" },
      });
      container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-primary']")!.click();
      expect(opened).toEqual(["vscode://file/tmp/my-project"]);
      dispose();
    } finally {
      window.open = originalOpen;
    }
  });

  it("host-supplied props override the defaults", () => {
    const { container, dispose, onOpenInEditor, onPreferredEditorChange } = mount({
      withHostOpenIn: true,
      threadOverrides: { projectDir: "/tmp/ignored-by-host-prop" },
    });
    expect(
      container
        .querySelector("[data-testid='open-in-picker-primary']")
        ?.getAttribute("data-editor-id"),
    ).toBe("vscode");
    container.querySelector<HTMLButtonElement>("[data-testid='open-in-picker-primary']")!.click();
    // The host-supplied openInCwd ("/tmp/project") wins over the
    // thread's projectDir, and the host-supplied handler runs
    // instead of the localStorage default.
    expect(onOpenInEditor).toHaveBeenCalledExactlyOnceWith("vscode", "/tmp/project");
    expect(onPreferredEditorChange).toHaveBeenCalledExactlyOnceWith("vscode");
    dispose();
  });
});
