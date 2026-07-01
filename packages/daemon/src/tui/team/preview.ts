/**
 * Pure text shaping for the team TUI live-preview pane.
 *
 * The preview mirrors a session's active pane (captured via tmux). This helper
 * takes the raw capture and shapes it to fit the preview region: keep the tail
 * of the output, drop the trailing blank lines tmux leaves behind, and clip
 * each line to the column budget so nothing wraps chaotically.
 */

/**
 * Shape raw captured pane text into a bounded list of lines.
 *
 * - Splits on "\n".
 * - Drops trailing blank/whitespace-only lines (internal blanks are kept).
 * - Returns the LAST `maxLines` lines.
 * - Truncates each line to `maxWidth` chars; `maxWidth <= 0` skips truncation.
 *
 * Never throws. Empty or whitespace-only input yields `[]`.
 */
export function previewLines(raw: string, maxLines: number, maxWidth: number): string[] {
  if (!raw) return [];
  const lines = raw.split("\n");
  // Drop trailing empty/whitespace lines, keeping internal blanks intact.
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  if (end === 0) return [];

  const limit = maxLines > 0 ? maxLines : 0;
  const start = limit > 0 ? Math.max(0, end - limit) : 0;
  const tail = lines.slice(start, end);

  if (maxWidth <= 0) return tail;
  return tail.map((line) => (line.length > maxWidth ? line.slice(0, maxWidth) : line));
}
