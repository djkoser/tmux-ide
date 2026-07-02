/**
 * Char-input reducer for the team TUI's inline text prompts (e.g. the
 * register-dir input). Kept pure and separate from `index.tsx` — which runs
 * `render(...)` on import — so it can be unit-tested in isolation.
 *
 * `return`/`escape` are handled by the caller; this only covers the two
 * text-editing keys. Returns the next value, or `null` when the key isn't a
 * printable char or backspace (so the caller can ignore it).
 */
export interface InputKey {
  name: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export function nextInput(prev: string, evt: InputKey): string | null {
  if (evt.name === "backspace") return prev.slice(0, -1);
  if (evt.name.length === 1 && !evt.ctrl && !evt.alt && !evt.meta) return prev + evt.name;
  return null;
}

/**
 * Suggest a tmux session name based on `base`, appending a numeric suffix
 * (`-2`, `-3`, …) until `exists` reports the name free. Used by the team TUI's
 * new-session prompt to avoid colliding with a live session.
 */
export function suggestSessionName(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists(candidate)) return candidate;
  }
}
