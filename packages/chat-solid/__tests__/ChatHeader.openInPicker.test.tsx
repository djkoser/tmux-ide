/**
 * ChatHeader wires the OpenInPicker chip when every editor-related
 * prop is supplied. Hosts that don't surface the affordance pass
 * none of them and the chip stays hidden.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { ChatHeader } from "../src/components/ChatHeader";
import type { EditorId } from "../src/components/OpenInPicker";
import type { ThreadState } from "../src/types";

afterEach(() => {
  document.body.innerHTML = "";
});

function thread(): ThreadState {
  return {
    id: "t1",
    title: "First chat",
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    provider: { kind: "claude-code" },
    messages: [],
  };
}

interface MountOpts {
  withOpenIn?: boolean;
  available?: EditorId[];
  preferred?: EditorId | null;
  cwd?: string | null;
}

function mount(opts: MountOpts = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const [t] = createSignal<ThreadState | null>(thread());
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
        availableEditors={opts.withOpenIn ? editors : undefined}
        preferredEditor={opts.withOpenIn ? preferred : undefined}
        openInCwd={opts.withOpenIn ? cwd : undefined}
        onOpenInEditor={opts.withOpenIn ? onOpenInEditor : undefined}
        onPreferredEditorChange={opts.withOpenIn ? onPreferredEditorChange : undefined}
      />
    ),
    container,
  );

  return { container, dispose, onOpenInEditor, onPreferredEditorChange };
}

describe("ChatHeader — OpenInPicker mount", () => {
  it("hides the chip when no editor props are supplied", () => {
    const { container, dispose } = mount();
    expect(container.querySelector("[data-testid='open-in-picker']")).toBeNull();
    dispose();
  });

  it("mounts the chip when every editor prop is supplied", () => {
    const { container, dispose } = mount({ withOpenIn: true });
    expect(container.querySelector("[data-testid='open-in-picker']")).toBeTruthy();
    expect(
      container.querySelector("[data-testid='open-in-picker-primary']")?.getAttribute("data-editor-id"),
    ).toBe("vscode");
    dispose();
  });

  it("forwards the primary click to onOpenInEditor with cwd", () => {
    const { container, dispose, onOpenInEditor, onPreferredEditorChange } = mount({
      withOpenIn: true,
    });
    container
      .querySelector<HTMLButtonElement>("[data-testid='open-in-picker-primary']")!
      .click();
    expect(onOpenInEditor).toHaveBeenCalledExactlyOnceWith("vscode", "/tmp/project");
    expect(onPreferredEditorChange).toHaveBeenCalledExactlyOnceWith("vscode");
    dispose();
  });
});
