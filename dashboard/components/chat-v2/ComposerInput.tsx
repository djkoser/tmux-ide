/**
 * Sticky composer at the bottom of ThreadView. Submits on Enter (Shift+
 * Enter inserts a newline). Disabled while a turn is in flight.
 *
 * Wired UX wins (ported from t3 via chat-solid):
 *  - Per-thread draft persistence: keystrokes are debounced and saved to
 *    localStorage["tmux-ide:composer:drafts:v1"][threadId]. Restored on
 *    thread switch, cleared on send. Survives page reloads.
 *  - @-mention autocomplete: when `mentionCandidates` is non-empty, a
 *    menu opens on `@` and filters as the user types. Tab / Enter
 *    inserts the chosen `@value `; Esc dismisses.
 *
 * The pure detect/search/store functions are imported from
 * `@tmux-ide/chat-solid` (its package entry re-exports them so the two
 * composers stay in lockstep without duplicating logic).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  clearDraft,
  detectMentionContext,
  loadDraft,
  saveDraft,
  searchMentions,
  type MentionCandidate,
  type MentionSearchResult,
} from "@tmux-ide/chat-solid";
import { ComposerMentionMenu } from "./ComposerMentionMenu";

export interface ComposerInputProps {
  disabled?: boolean;
  placeholder?: string;
  /**
   * Identity for per-thread draft persistence. When provided, keystrokes
   * are saved (debounced) to localStorage and restored on thread switch.
   * Falsy disables persistence (no thread selected).
   */
  threadId?: string | null;
  /**
   * Candidates surfaced by the @-mention autocomplete. Owner is the
   * host (V2ChatView) which composes files + threads + agents + skills.
   * Empty / undefined keeps the menu suppressed; the `@` types through.
   */
  mentionCandidates?: ReadonlyArray<MentionCandidate>;
  onSubmit(text: string): void;
}

export function ComposerInput({
  disabled,
  placeholder,
  threadId,
  mentionCandidates,
  onSubmit,
}: ComposerInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState<string>(() => (threadId ? loadDraft(threadId) : ""));
  const [caret, setCaret] = useState(0);
  const [hiddenMention, setHiddenMention] = useState<{ atIndex: number; query: string } | null>(
    null,
  );
  const [mentionHighlight, setMentionHighlight] = useState(0);

  // Restore draft on thread switch. Skip the very first render — initial
  // useState already seeded `value` from loadDraft(threadId).
  const firstThread = useRef(threadId);
  useEffect(() => {
    if (firstThread.current === threadId) return;
    firstThread.current = threadId;
    setValue(threadId ? loadDraft(threadId) : "");
    setHiddenMention(null);
  }, [threadId]);

  // Persist keystrokes (debounced inside the store).
  useEffect(() => {
    if (!threadId) return;
    saveDraft(threadId, value);
  }, [threadId, value]);

  const mentionContext = useMemo(() => detectMentionContext(value, caret), [value, caret]);

  const mentionResults = useMemo<MentionSearchResult[]>(() => {
    if (!mentionCandidates || mentionCandidates.length === 0) return [];
    if (!mentionContext.active) return [];
    return searchMentions(mentionCandidates, mentionContext.query);
  }, [mentionCandidates, mentionContext]);

  const showMentions =
    mentionContext.active &&
    mentionResults.length >= 0 &&
    (mentionCandidates?.length ?? 0) > 0 &&
    !(
      hiddenMention &&
      mentionContext.active &&
      hiddenMention.atIndex === mentionContext.atIndex &&
      hiddenMention.query === mentionContext.query
    );

  useEffect(() => {
    setMentionHighlight(0);
  }, [mentionContext.active ? mentionContext.query : null]);

  const setCaretFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? value.length);
  }, [value.length]);

  const setTextareaCaret = useCallback((nextCaret: number) => {
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  }, []);

  function selectMention(candidate: MentionCandidate) {
    if (!mentionContext.active) return;
    const tail = value.slice(caret);
    const tokenTailLength = tail.search(/\s/);
    const replaceEnd = tokenTailLength === -1 ? value.length : caret + tokenTailLength;
    const replacement = `@${candidate.value} `;
    const next = value.slice(0, mentionContext.atIndex) + replacement + value.slice(replaceEnd);
    const nextCaret = mentionContext.atIndex + replacement.length;
    setValue(next);
    setHiddenMention(null);
    setMentionHighlight(0);
    setTextareaCaret(nextCaret);
  }

  function closeMentionMenu() {
    if (!mentionContext.active) return;
    setHiddenMention({ atIndex: mentionContext.atIndex, query: mentionContext.query });
    setTextareaCaret(caret);
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    setCaret(0);
    setHiddenMention(null);
    if (threadId) clearDraft(threadId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentions) {
      if (event.key === "ArrowDown" && mentionResults.length > 0) {
        event.preventDefault();
        setMentionHighlight((prev) => (prev + 1) % mentionResults.length);
        return;
      }
      if (event.key === "ArrowUp" && mentionResults.length > 0) {
        event.preventDefault();
        setMentionHighlight(
          (prev) => (prev - 1 + mentionResults.length) % mentionResults.length,
        );
        return;
      }
      if ((event.key === "Tab" || event.key === "Enter") && mentionResults.length > 0) {
        event.preventDefault();
        const sel = mentionResults[Math.min(mentionHighlight, mentionResults.length - 1)];
        if (sel) selectMention(sel.candidate);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMentionMenu();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      data-testid="composer-input"
      data-thread-id={threadId ?? ""}
      className="relative flex items-end gap-2 border-t border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2"
    >
      <ComposerMentionMenu
        open={showMentions}
        results={mentionResults}
        highlightedIndex={mentionHighlight}
        onHighlight={setMentionHighlight}
        onSelect={selectMention}
        anchorRef={textareaRef}
      />
      <textarea
        ref={textareaRef}
        data-testid="composer-input-textarea"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={setCaretFromTextarea}
        onClick={setCaretFromTextarea}
        onSelect={setCaretFromTextarea}
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
