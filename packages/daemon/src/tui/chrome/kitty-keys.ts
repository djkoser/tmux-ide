/**
 * Kitty-keyboard-protocol fallback binds for the root-table Alt keys.
 *
 * Claude Code enables the Kitty keyboard protocol with event-type reporting.
 * Under it, the FOCUSED pane's terminal encodes e.g. Alt-m not as the legacy
 * `ESC m` but as the CSI-u form `ESC[109;3:1u` (109 = 'm', 3 = the Alt modifier,
 * `:1` = a key-PRESS event-type subparameter). tmux 3.6 does NOT normalize that
 * `:1`-carrying full form back to `M-m`, so a root-table `bind-key -n M-m` never
 * fires while a Claude Code pane is focused — every dock shortcut (⌥m/⌥p/⌥k/⌥b/
 * ⌥e/⌥g/⌥,/⌥h) goes dead. Plain `ESC m` and the basic CSI-u `ESC[109;3u` both
 * DO reach tmux as `M-m`; only the `:1` full form misses (proven live by
 * injecting each encoding into a nested client).
 *
 * The fix is a tmux USER-KEY fallback per Alt bind: teach tmux the exact kitty
 * escape as `user-keys[N]`, then bind `UserN` to the SAME action argv as the
 * `M-…` key. tmux matches the raw escape against the user-key and fires the
 * bind, so the shortcut works whether the focused pane speaks legacy or full
 * kitty. Registering the fallback is harmless for panes that never send the
 * `:1` form (nothing else emits `UserN`).
 *
 * Pure — tested as a table; the io (registering the binds) lives in
 * {@link ./statusline.ts}.
 */

/**
 * PURE — the full-kitty key-PRESS encoding for a single-char Alt key (`M-<c>`),
 * or `null` for anything else (multi-char key names, non-Alt keys — they don't
 * get a fallback). The sequence is `ESC[<code>;3:1u` where `<code>` is the code
 * point of the (lowercased) character, `3` is the Alt modifier, and `:1` is the
 * key-press event-type subparameter. Examples: `M-m` → `ESC[109;3:1u`, `M-h` →
 * `ESC[104;3:1u`, `M-,` → `ESC[44;3:1u`.
 */
export function kittyEscapeFor(key: string): string | null {
  const m = /^M-(.)$/.exec(key);
  const ch = m?.[1];
  if (ch === undefined) return null;
  const code = ch.toLowerCase().codePointAt(0);
  if (code === undefined) return null;
  return `\x1b[${code};3:1u`;
}

/**
 * PURE — the tmux `user-keys` array index for the Nth Alt fallback. We claim the
 * range `[100, …)` (offset 100) so we never clobber a user's own
 * `user-keys[0..]` entries — anyone hand-setting `user-keys` should keep their
 * indices below 100.
 */
export function kittyUserKeyIndex(slot: number): number {
  return 100 + slot;
}

/** PURE — the tmux key name a `user-keys[idx]` entry surfaces as (`UserN`). */
export function kittyUserKeyName(slot: number): string {
  return `User${kittyUserKeyIndex(slot)}`;
}
