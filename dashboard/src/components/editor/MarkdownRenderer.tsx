/**
 * Markdown renderer — Solid port of emdash's
 * `markdown-renderer.tsx`.
 *
 * Reads the source from the Monaco model registry (buffer URI →
 * disk URI fallback). The floating Eye/Pencil toggle flips between
 * rendered HTML (via chat-solid's DOMPurify-wrapped `renderMarkdown`)
 * and a raw-source view in a monospaced `<pre>`. The optional
 * `onEditSource` prop is invoked when the user explicitly wants to
 * open the file as a writable text buffer.
 *
 * Reactive: `useBufferVersion()` ticks on every edit; the rendered
 * HTML / source memo re-runs without a polling loop.
 */

import { Eye, Pencil } from "lucide-solid";
import { createMemo, createSignal, Show } from "solid-js";
import { renderMarkdown } from "@tmux-ide/chat-solid";
import { modelRegistry } from "@/lib/monaco/model-registry";
import { useBufferVersion } from "@/lib/monaco/use-model";
import { buildMonacoModelPath, toDiskUri } from "@/lib/monaco/model-path";

interface MarkdownRendererProps {
  filePath: string;
  modelRootPath: string;
  /**
   * Optional host hook for opening the file as a writable text
   * buffer. The internal source toggle is independent — it shows
   * the raw markdown in a read-only `<pre>`; `onEditSource` opens
   * the Monaco editor on the same path.
   */
  onEditSource?: (filePath: string) => void;
}

type Mode = "preview" | "source";

export function MarkdownRenderer(props: MarkdownRendererProps) {
  const [mode, setMode] = createSignal<Mode>("preview");
  const bufferUri = () => buildMonacoModelPath(props.modelRootPath, props.filePath);
  const bufferVersion = useBufferVersion(bufferUri());

  const source = createMemo<string>(() => {
    // Subscribe to the buffer's version so the memo re-evaluates on
    // every edit. The void read is enough — Solid tracks the call.
    void bufferVersion();
    return (
      modelRegistry.getValue(bufferUri()) ?? modelRegistry.getValue(toDiskUri(bufferUri())) ?? ""
    );
  });

  const html = createMemo<string>(() => renderMarkdown(source()));

  return (
    <div
      data-testid="editor-markdown-renderer"
      data-mode={mode()}
      class="relative h-full overflow-y-auto bg-[var(--bg)]"
    >
      <div class="sticky top-3 z-10 float-right mr-3 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
        <button
          type="button"
          data-testid="editor-markdown-toggle-preview"
          aria-label="Preview"
          aria-pressed={mode() === "preview"}
          onClick={() => setMode("preview")}
          class={
            "inline-flex h-6 w-6 items-center justify-center rounded " +
            (mode() === "preview"
              ? "bg-[var(--surface-active)] text-[var(--accent)]"
              : "text-[var(--dim)] hover:bg-[var(--surface-active)] hover:text-[var(--fg)]")
          }
        >
          <Eye class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          data-testid="editor-markdown-toggle-source"
          aria-label="Source"
          aria-pressed={mode() === "source"}
          onClick={() => {
            // If the host wired an explicit open-as-text handler,
            // prefer that — it gives the user the Monaco editor
            // surface. Otherwise just flip our internal mode and
            // show the raw text in-place.
            if (props.onEditSource) {
              props.onEditSource(props.filePath);
              return;
            }
            setMode("source");
          }}
          class={
            "inline-flex h-6 w-6 items-center justify-center rounded " +
            (mode() === "source"
              ? "bg-[var(--surface-active)] text-[var(--accent)]"
              : "text-[var(--dim)] hover:bg-[var(--surface-active)] hover:text-[var(--fg)]")
          }
        >
          <Pencil class="h-3.5 w-3.5" />
        </button>
      </div>
      <Show
        when={mode() === "preview"}
        fallback={
          <pre
            data-testid="editor-markdown-source"
            class="whitespace-pre-wrap break-words px-8 py-8 font-mono text-[12px] text-[var(--fg)]"
          >
            {source()}
          </pre>
        }
      >
        <div
          class="chat-markdown w-full max-w-3xl px-8 py-8"
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={html()}
        />
      </Show>
    </div>
  );
}
