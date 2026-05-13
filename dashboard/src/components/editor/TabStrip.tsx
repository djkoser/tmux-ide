/**
 * TabStrip — open-buffer tab list above the editor pane.
 *
 * Reads from the buffer store (`bufferState.order` +
 * `bufferState.buffers`). Each tab shows the file basename + a
 * dirty dot (`•`) when `buffer.dirty` is true + a close button.
 * Active tab styling derives from `bufferState.activeUri`.
 *
 * Clicking a tab calls `setActiveBuffer(uri)`. Close `×` calls
 * `closeBuffer(uri)`; a dirty buffer requires a `discardDirty`
 * confirm — for G17-P5 the host wires `window.confirm` so the
 * tab strip stays presentational.
 */

import { For, Show } from "solid-js";
import { X } from "lucide-solid";
import {
  bufferState,
  closeBuffer,
  setActiveBuffer,
  type OpenBuffer,
} from "@/lib/editor/buffer-store";

interface TabStripProps {
  /**
   * Confirm-on-close hook. Defaults to `window.confirm` when
   * omitted. Returning false aborts the close.
   */
  onConfirmDiscardDirty?: (buf: OpenBuffer) => boolean;
}

function basename(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? filePath : filePath.slice(idx + 1);
}

export function TabStrip(props: TabStripProps) {
  function tryClose(uri: string) {
    const buf = bufferState.buffers[uri];
    if (!buf) return;
    if (!buf.dirty) {
      closeBuffer(uri);
      return;
    }
    const confirmFn =
      props.onConfirmDiscardDirty ??
      ((b: OpenBuffer) =>
        typeof window !== "undefined" &&
        typeof window.confirm === "function" &&
        window.confirm(`Discard unsaved changes to ${b.filePath}?`));
    if (confirmFn(buf)) {
      closeBuffer(uri, { discardDirty: true });
    }
  }

  return (
    <Show when={bufferState.order.length > 0}>
      <div
        data-testid="editor-tab-strip"
        role="tablist"
        class="flex h-7 shrink-0 items-center overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-strong)] text-[12px]"
      >
        <For each={bufferState.order}>
          {(uri) => {
            const buf = () => bufferState.buffers[uri];
            const active = () => bufferState.activeUri === uri;
            return (
              <Show when={buf()}>
                {(b) => (
                  <div
                    data-testid="editor-tab"
                    data-buffer-uri={uri}
                    data-active={active() ? "true" : undefined}
                    data-dirty={b().dirty ? "true" : undefined}
                    role="tab"
                    aria-selected={active()}
                    class={
                      "group flex h-7 shrink-0 items-center gap-1.5 border-r border-[var(--border)] px-3 text-[12px] " +
                      (active()
                        ? "bg-[var(--bg)] text-[var(--fg)]"
                        : "text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]")
                    }
                  >
                    <button
                      type="button"
                      data-testid="editor-tab-pick"
                      onClick={() => setActiveBuffer(uri)}
                      class="inline-flex items-center gap-1 bg-transparent text-left text-[12px] text-inherit"
                    >
                      <Show when={b().dirty}>
                        <span
                          aria-hidden="true"
                          data-testid="editor-tab-dirty-dot"
                          class="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                        />
                      </Show>
                      <span class="font-mono">{basename(b().filePath)}</span>
                      <Show when={b().status === "loading"}>
                        <span class="text-[10px] text-[var(--dim)]">loading…</span>
                      </Show>
                      <Show when={b().status === "error"}>
                        <span class="text-[10px] text-[var(--red-foreground,var(--red))]">!</span>
                      </Show>
                      <Show when={b().saving}>
                        <span class="text-[10px] text-[var(--dim)]">saving…</span>
                      </Show>
                    </button>
                    <button
                      type="button"
                      data-testid="editor-tab-close"
                      aria-label={`Close ${b().filePath}`}
                      title={b().dirty ? "Unsaved changes" : "Close"}
                      onClick={() => tryClose(uri)}
                      class="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--dim)] opacity-0 transition-opacity hover:bg-[var(--surface-active)] hover:text-[var(--fg)] focus:opacity-100 group-hover:opacity-100"
                    >
                      <X class="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </Show>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
