/**
 * vitest mock for @tmux-ide/chat-solid. Returns minimal in-memory
 * implementations of the helpers chat-v2 imports so component tests
 * don't have to spin up the real solid runtime.
 */

export type MentionCandidate = {
  kind: "file" | "thread" | "agent";
  value: string;
  label: string;
  hint?: string;
};

export type MentionSearchResult = {
  candidate: MentionCandidate;
  score: number;
  matched: number[];
};

export type MentionContext =
  | { active: false }
  | { active: true; atIndex: number; query: string };

export function mount(): { unmount(): void; setThreadId(id: string): void } {
  return {
    unmount: () => undefined,
    setThreadId: () => undefined,
  };
}

// In-memory draft store — survives across saves within the test process,
// reset by test setup if needed.
const drafts = new Map<string, string>();

export function loadDraft(threadId: string | null | undefined): string {
  if (!threadId) return "";
  return drafts.get(threadId) ?? "";
}

export function saveDraft(threadId: string | null | undefined, prompt: string): void {
  if (!threadId) return;
  if (!prompt) drafts.delete(threadId);
  else drafts.set(threadId, prompt);
}

export function clearDraft(threadId: string | null | undefined): void {
  if (!threadId) return;
  drafts.delete(threadId);
}

export function flushDrafts(): void {
  /* no-op in the mock */
}

export function detectMentionContext(value: string, caret: number): MentionContext {
  const boundedCaret = Math.max(0, Math.min(caret, value.length));
  if (boundedCaret === 0) return { active: false };
  const atIndex = value.lastIndexOf("@", boundedCaret - 1);
  if (atIndex < 0) return { active: false };
  if (atIndex > 0 && !/\s/.test(value[atIndex - 1] ?? "")) return { active: false };
  const query = value.slice(atIndex + 1, boundedCaret);
  if (/\s/.test(query) || query.includes("@")) return { active: false };
  return { active: true, atIndex, query };
}

export type MarkdownFileLinkMeta = {
  filePath: string;
  targetPath: string;
  displayPath: string;
  basename: string;
  line?: number;
  column?: number;
};

export function resolveMarkdownFileLinkTarget(): null {
  return null;
}

export function resolveMarkdownFileLinkMeta(): null {
  return null;
}

export function rewriteMarkdownFileUriHref(): null {
  return null;
}

export function renderMarkdown(input: string): string {
  return input;
}

export function searchMentions(
  candidates: ReadonlyArray<MentionCandidate>,
  query: string,
  limit = 12,
): MentionSearchResult[] {
  const q = query.toLowerCase();
  const matchIndexes = (lbl: string): number[] | null => {
    const m: number[] = [];
    let qi = 0;
    for (let i = 0; i < lbl.length && qi < q.length; i++) {
      if (lbl[i] === q[qi]) {
        m.push(i);
        qi++;
      }
    }
    return qi === q.length ? m : null;
  };

  if (!q) {
    return candidates.slice(0, limit).map((candidate) => ({
      candidate,
      score: -candidate.label.length,
      matched: [],
    }));
  }
  const results: MentionSearchResult[] = [];
  for (const candidate of candidates) {
    const matched = matchIndexes(candidate.label.toLowerCase());
    if (!matched) continue;
    results.push({ candidate, score: -matched[0], matched });
  }
  return results.slice(0, limit);
}
