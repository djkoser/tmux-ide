/**
 * Index arithmetic for the team TUI's app-shell navigation. Kept pure and
 * separate from `index.tsx` — which runs `render(...)` on import — so the
 * project/session cursor maths can be unit-tested in isolation.
 *
 * The shell tracks two cursors: the active PROJECT (into the visible project
 * list) and the active SESSION (into that project's sessions). Both need the
 * same two operations — clamp an index after the underlying list changes under
 * a refresh, and wrap it as the user pages up/down.
 */

/**
 * Clamp `i` into `[0, len - 1]`. An empty (or negative-length) list clamps to
 * `0` so a cursor never dangles past the end after a refresh shrinks the list.
 */
export function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  if (i < 0) return 0;
  if (i >= len) return len - 1;
  return i;
}

/**
 * Move `i` by `delta` within a list of `len`, wrapping around both ends (so
 * up from the top lands on the bottom and vice versa). An empty list yields
 * `0`. `delta` may be any integer.
 */
export function wrapIndex(i: number, delta: number, len: number): number {
  if (len <= 0) return 0;
  return (((i + delta) % len) + len) % len;
}
