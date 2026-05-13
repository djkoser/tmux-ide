/**
 * MergeConflictPanel — three-way merge UI for a buffer whose
 * on-disk content was rewritten externally while the user still
 * had unsaved edits. Replaces the G17-P6 banner-with-two-buttons
 * when both conditions hold (`dirty` + `externalContent !== null`).
 *
 * Layout:
 *   ┌─ Header ─────────────────────────────────────────────────┐
 *   │ ⚠ Merge conflict — file.ts                                │
 *   ├─ "Their changes" diff (base ↔ external, read-only) ──────┤
 *   │                                                           │
 *   ├─ "Your changes" diff (base ↔ local, read-only) ──────────┤
 *   │                                                           │
 *   ├─ Merged result (editable textarea) ──────────────────────┤
 *   │                                                           │
 *   │ Seed buttons: [From external] [From mine]                 │
 *   └─ Actions: [Use external] [Use mine] [Apply merged] ──────┘
 *
 * The three resolution paths:
 *   - "Use external" → `acceptExternalChange(uri)` (drops local
 *     edits, takes the on-disk version).
 *   - "Use mine"     → `dismissExternalChange(uri)` (keeps local
 *     edits; next save will overwrite the disk change).
 *   - "Apply merged" → `resolveConflict(uri, merged)` — buffer
 *     content becomes the merged result; user reviews + Cmd+S
 *     to persist.
 */

import { createMemo, createSignal, Show } from "solid-js";
import { AlertTriangle, FileText, ArrowLeft, ArrowRight } from "lucide-solid";
import {
  acceptExternalChange,
  dismissExternalChange,
  resolveConflict,
  type OpenBuffer,
} from "@/lib/editor/buffer-store";
import { DiffPreview } from "@/components/editor/DiffPreview";

export interface MergeConflictPanelProps {
  buffer: OpenBuffer;
}

export function MergeConflictPanel(props: MergeConflictPanelProps) {
  const ext = () => props.buffer.externalContent ?? "";
  const [merged, setMerged] = createSignal<string>(props.buffer.content);

  // Each conflict panel needs a unique inmemory:// URI stem so
  // concurrent panels don't clash on Monaco's model cache.
  const diffId = createMemo(() => `merge-${props.buffer.bufferUri}`);

  function onApply() {
    resolveConflict(props.buffer.bufferUri, merged());
  }

  return (
    <div
      data-testid="v2-merge-conflict-panel"
      data-buffer-uri={props.buffer.bufferUri}
      class="flex h-full min-h-0 w-full flex-col bg-[var(--bg)] text-[var(--fg)]"
    >
      <header class="flex shrink-0 items-center gap-2 border-b border-[var(--yellow,var(--accent))] bg-[var(--surface)] px-3 py-2 text-[12px]">
        <AlertTriangle
          aria-hidden="true"
          class="h-4 w-4 text-[var(--yellow,var(--accent))]"
        />
        <span>Merge conflict — </span>
        <FileText aria-hidden="true" class="h-3 w-3 opacity-60" />
        <span class="font-mono">{props.buffer.filePath}</span>
        <span class="text-[var(--dim)]">
          changed on disk while you had unsaved edits
        </span>
      </header>

      <section
        data-testid="v2-merge-section-theirs"
        class="flex min-h-0 flex-1 flex-col border-b border-[var(--border)]"
      >
        <div class="flex h-6 shrink-0 items-center gap-2 border-b border-[var(--border-weak,var(--border))] bg-[var(--bg-strong)] px-3 text-[10px] uppercase tracking-wide text-[var(--dim)]">
          Their changes — base
          <ArrowRight class="h-3 w-3" aria-hidden="true" />
          external
        </div>
        <div class="min-h-0 flex-1">
          <DiffPreview
            id={`${diffId()}-theirs`}
            language={props.buffer.language}
            original={props.buffer.baseContent}
            modified={ext()}
          />
        </div>
      </section>

      <section
        data-testid="v2-merge-section-yours"
        class="flex min-h-0 flex-1 flex-col border-b border-[var(--border)]"
      >
        <div class="flex h-6 shrink-0 items-center gap-2 border-b border-[var(--border-weak,var(--border))] bg-[var(--bg-strong)] px-3 text-[10px] uppercase tracking-wide text-[var(--dim)]">
          Your changes — base
          <ArrowRight class="h-3 w-3" aria-hidden="true" />
          local
        </div>
        <div class="min-h-0 flex-1">
          <DiffPreview
            id={`${diffId()}-yours`}
            language={props.buffer.language}
            original={props.buffer.baseContent}
            modified={props.buffer.content}
          />
        </div>
      </section>

      <section
        data-testid="v2-merge-section-merged"
        class="flex min-h-0 flex-1 flex-col"
      >
        <div class="flex h-6 shrink-0 items-center gap-2 border-b border-[var(--border-weak,var(--border))] bg-[var(--bg-strong)] px-3 text-[10px] uppercase tracking-wide text-[var(--dim)]">
          Merged result
          <span class="flex-1" />
          <button
            type="button"
            data-testid="v2-merge-seed-external"
            onClick={() => setMerged(ext())}
            class="inline-flex h-4 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
            title="Replace merged content with the external version"
          >
            <ArrowLeft class="h-2.5 w-2.5" aria-hidden="true" />
            From external
          </button>
          <button
            type="button"
            data-testid="v2-merge-seed-local"
            onClick={() => setMerged(props.buffer.content)}
            class="inline-flex h-4 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
            title="Replace merged content with your local version"
          >
            <ArrowLeft class="h-2.5 w-2.5" aria-hidden="true" />
            From mine
          </button>
        </div>
        <textarea
          data-testid="v2-merge-merged-input"
          value={merged()}
          onInput={(e) => setMerged(e.currentTarget.value)}
          spellcheck={false}
          autocomplete="off"
          class="min-h-0 flex-1 resize-none border-0 bg-[var(--bg)] p-3 font-mono text-[12px] leading-relaxed text-[var(--fg)] outline-none"
        />
      </section>

      <footer
        data-testid="v2-merge-actions"
        class="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px]"
      >
        <span class="text-[var(--dim)]">
          Apply doesn't save — review the merged result, then Cmd+S
        </span>
        <span class="flex-1" />
        <button
          type="button"
          data-testid="v2-merge-use-external"
          onClick={() => acceptExternalChange(props.buffer.bufferUri)}
          class="h-6 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
          title="Drop your edits and use the external version"
        >
          Use external
        </button>
        <button
          type="button"
          data-testid="v2-merge-use-mine"
          onClick={() => dismissExternalChange(props.buffer.bufferUri)}
          class="h-6 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
          title="Keep your edits; next save will overwrite the disk change"
        >
          Use mine
        </button>
        <button
          type="button"
          data-testid="v2-merge-apply"
          onClick={() => onApply()}
          disabled={merged() === props.buffer.content && props.buffer.externalContent !== null}
          class="h-6 rounded border border-[var(--accent)] bg-[var(--surface-active)] px-2 text-[11px] text-[var(--accent)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          title="Apply the merged content to the buffer (does not save)"
        >
          Apply merged
        </button>
        <Show when={props.buffer.saveError}>
          <span class="text-[var(--red-foreground,var(--red))]">
            {props.buffer.saveError}
          </span>
        </Show>
      </footer>
    </div>
  );
}
