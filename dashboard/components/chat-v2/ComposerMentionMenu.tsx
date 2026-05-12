/**
 * React menu rendered above the composer textarea while an @-mention
 * autocomplete is active. Mirror of chat-solid's ComposerMentionMenu —
 * same data contract (results / highlight / select), same kbd hint row.
 *
 * Visual + data-* hooks intentionally line up so the chat-solid and
 * chat-v2 composers behave identically under integration test selectors.
 */
import { useEffect, useRef, useState } from "react";
import type { MentionCandidate, MentionSearchResult } from "@tmux-ide/chat-solid";

interface ComposerMentionMenuProps {
  open: boolean;
  results: MentionSearchResult[];
  highlightedIndex: number;
  onHighlight(index: number): void;
  onSelect(candidate: MentionCandidate): void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function HighlightedLabel({ result }: { result: MentionSearchResult }) {
  const matched = new Set(result.matched);
  return (
    <>
      {[...result.candidate.label].map((ch, i) => (
        <span key={i} className={matched.has(i) ? "font-semibold text-[var(--fg)]" : undefined}>
          {ch}
        </span>
      ))}
    </>
  );
}

function kindGlyph(kind: MentionCandidate["kind"]): string {
  switch (kind) {
    case "file":
      return "▤";
    case "thread":
      return "❯";
    case "agent":
      return "◐";
    default:
      return "·";
  }
}

export function ComposerMentionMenu(props: ComposerMentionMenuProps) {
  const [width, setWidth] = useState(320);

  useEffect(() => {
    if (!props.open) return;
    const anchor = props.anchorRef.current;
    if (!anchor) return;
    const updateWidth = () => {
      const rect = anchor.getBoundingClientRect();
      setWidth(Math.max(240, Math.min(480, rect.width)));
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [props.open, props.anchorRef]);

  if (!props.open) return null;

  return (
    <div
      data-testid="composer-mention-menu"
      role="listbox"
      aria-label="Mentions"
      className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-elevated,var(--bg-strong))] text-[12px] shadow-2xl"
      style={{ width: `${width}px` }}
    >
      {props.results.length === 0 ? (
        <div className="px-3 py-4 text-center text-[var(--dim)]">No matches</div>
      ) : (
        <div className="max-h-64 overflow-y-auto p-1">
          {props.results.map((result, index) => (
            <button
              key={`${result.candidate.kind}:${result.candidate.value}`}
              type="button"
              data-mention-index={index}
              data-mention-kind={result.candidate.kind}
              role="option"
              aria-selected={props.highlightedIndex === index}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-[var(--fg)] ${
                props.highlightedIndex === index ? "bg-[var(--surface-hover)]" : ""
              }`}
              onMouseEnter={() => props.onHighlight(index)}
              onClick={() => props.onSelect(result.candidate)}
            >
              <span aria-hidden className="w-4 text-center text-[11px] text-[var(--dim)]">
                {kindGlyph(result.candidate.kind)}
              </span>
              <span className="min-w-0 flex-1">
                <div className="truncate">
                  <HighlightedLabel result={result} />
                </div>
                {result.candidate.hint && (
                  <div className="mt-0.5 truncate text-[11px] text-[var(--dim)]">
                    {result.candidate.hint}
                  </div>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="border-t border-[var(--border-weak)] px-3 py-1.5 text-[11px] text-[var(--dim)]">
        ↑↓ navigate · Enter select · Esc close
      </div>
    </div>
  );
}

/**
 * Convenience hook used by `ComposerInput` — narrows the anchor type and
 * works around React 18 ref-callback semantics for tests that need a
 * stable ref before the textarea mounts.
 */
export function useAnchorRef<T extends HTMLElement>() {
  return useRef<T | null>(null);
}
