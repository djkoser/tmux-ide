/**
 * ComposerInput — covers the chat-v2 composer's t3-derived UX wins:
 *  1. Per-thread draft persistence (localStorage via @tmux-ide/chat-solid)
 *  2. @-mention autocomplete (menu open/close, filtering, insertion)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { ComposerInput } from "../ComposerInput";
import type { MentionCandidate } from "@tmux-ide/chat-solid";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // The chat-solid mock keeps drafts in a process-local Map — clear it
  // between tests so they don't share state.
  // Lazy import the mock so we touch the same module instance vitest hands
  // the component under test.
  return import("@tmux-ide/chat-solid").then((mod: { clearDraft: (id: string) => void }) => {
    for (const id of ["t-1", "t-2", "thread-42"]) mod.clearDraft(id);
  });
});

const FILE_CANDIDATES: MentionCandidate[] = [
  { kind: "file", value: "src/index.ts", label: "src/index.ts" },
  { kind: "file", value: "src/lib/api.ts", label: "src/lib/api.ts" },
  { kind: "file", value: "src/lib/composerDraftStore.ts", label: "src/lib/composerDraftStore.ts" },
];

function typeInto(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
  // Position the caret at the end so the mention detector matches what a
  // user would see after typing.
  textarea.selectionStart = value.length;
  textarea.selectionEnd = value.length;
  fireEvent.keyUp(textarea, { key: "" });
}

describe("ComposerInput — draft persistence", () => {
  it("restores a saved draft when threadId is set on first mount", async () => {
    const mod = await import("@tmux-ide/chat-solid");
    (mod.saveDraft as (id: string, text: string) => void)("t-1", "saved keystrokes");
    render(<ComposerInput threadId="t-1" onSubmit={vi.fn()} />);
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("saved keystrokes");
  });

  it("clears the draft when the message is sent", async () => {
    const mod = await import("@tmux-ide/chat-solid");
    const onSubmit = vi.fn();
    render(<ComposerInput threadId="t-1" onSubmit={onSubmit} />);
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "ship it");
    fireEvent.click(screen.getByTestId("composer-input-send"));
    expect(onSubmit).toHaveBeenCalledWith("ship it");
    expect((mod.loadDraft as (id: string) => string)("t-1")).toBe("");
  });

  it("isolates drafts across threads (typing in one doesn't bleed into the other)", async () => {
    const mod = await import("@tmux-ide/chat-solid");
    const { rerender } = render(<ComposerInput threadId="t-1" onSubmit={vi.fn()} />);
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "for thread one");
    expect((mod.loadDraft as (id: string) => string)("t-1")).toBe("for thread one");

    // Switch threads. The effect should drop the t-1 draft and load t-2's (empty).
    rerender(<ComposerInput threadId="t-2" onSubmit={vi.fn()} />);
    const textarea2 = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    expect(textarea2.value).toBe("");
    expect((mod.loadDraft as (id: string) => string)("t-1")).toBe("for thread one");
  });
});

describe("ComposerInput — @-mention autocomplete", () => {
  it("opens the menu when an active `@` token is typed", () => {
    render(
      <ComposerInput
        threadId="t-1"
        mentionCandidates={FILE_CANDIDATES}
        onSubmit={vi.fn()}
      />,
    );
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "@");
    expect(screen.getByTestId("composer-mention-menu")).toBeTruthy();
  });

  it("stays closed when no candidates are provided", () => {
    render(<ComposerInput threadId="t-1" onSubmit={vi.fn()} />);
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "@anything");
    expect(screen.queryByTestId("composer-mention-menu")).toBeNull();
  });

  it("filters results as the user keeps typing", () => {
    render(
      <ComposerInput
        threadId="t-1"
        mentionCandidates={FILE_CANDIDATES}
        onSubmit={vi.fn()}
      />,
    );
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "@comp");
    const items = document.querySelectorAll('[data-mention-index]');
    expect(items.length).toBeGreaterThanOrEqual(1);
    const labels = Array.from(items).map((i) => i.textContent ?? "");
    // The composerDraftStore candidate should be present (subsequence match).
    expect(labels.join(" ")).toContain("composerDraftStore");
  });

  it("inserts `@<value> ` into the textarea on click", () => {
    render(
      <ComposerInput
        threadId="t-1"
        mentionCandidates={FILE_CANDIDATES}
        onSubmit={vi.fn()}
      />,
    );
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "see @api");
    const item = document.querySelector('[data-mention-index="0"]') as HTMLButtonElement | null;
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    // queueMicrotask runs before vitest's "next tick" — the value should already
    // be updated synchronously by React's state batch.
    expect(textarea.value.startsWith("see @")).toBe(true);
    expect(textarea.value).toContain(".ts ");
  });

  it("does not open the menu when @ is embedded mid-word (email-like)", () => {
    render(
      <ComposerInput
        threadId="t-1"
        mentionCandidates={FILE_CANDIDATES}
        onSubmit={vi.fn()}
      />,
    );
    const textarea = screen.getByTestId("composer-input-textarea") as HTMLTextAreaElement;
    typeInto(textarea, "user@example");
    expect(screen.queryByTestId("composer-mention-menu")).toBeNull();
  });
});
