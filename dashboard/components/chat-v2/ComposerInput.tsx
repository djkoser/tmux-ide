/**
 * Sticky composer at the bottom of ThreadView. Submits on Enter (Shift+
 * Enter inserts a newline). Disabled while a turn is in flight.
 */

import { useState, type KeyboardEvent } from "react";

export interface ComposerInputProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit(text: string): void;
}

export function ComposerInput({ disabled, placeholder, onSubmit }: ComposerInputProps) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      data-testid="composer-input"
      className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2"
    >
      <textarea
        data-testid="composer-input-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Say something…"}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded border border-[var(--border-weak)] bg-[var(--surface)] px-2 py-1 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
      />
      <button
        type="button"
        data-testid="composer-input-send"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="rounded border border-[var(--border-weak)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--fg)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}
