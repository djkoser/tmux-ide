/**
 * Cross-island bridge for "user wants to open this file in the editor".
 *
 * Producers (e.g. chat-solid's markdown file-link chips, the explorer
 * tree, the palette's task results) call `dispatchOpenFile(meta)`. The
 * consumer — typically ProjectV2Page's preview pane — calls
 * `subscribeOpenFile(listener)` and routes incoming events to its own
 * openInPreview state.
 *
 * Mirrors the pattern pane 1 introduced for the command palette's view
 * switcher (`tmuxide.palette-select-view`), so consumers stay decoupled
 * from producer packages — chat-solid stays Solid-only, the dashboard
 * stays React-only, and the CustomEvent is the cable between them.
 */

import type { MarkdownFileLinkMeta } from "@tmux-ide/chat-solid";

export const OPEN_FILE_EVENT = "tmuxide.open-file";

export type OpenFileEventDetail = MarkdownFileLinkMeta;

export function dispatchOpenFile(meta: MarkdownFileLinkMeta): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenFileEventDetail>(OPEN_FILE_EVENT, { detail: meta }));
}

export function subscribeOpenFile(
  listener: (meta: MarkdownFileLinkMeta) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<OpenFileEventDetail>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(OPEN_FILE_EVENT, handler);
  return () => window.removeEventListener(OPEN_FILE_EVENT, handler);
}
