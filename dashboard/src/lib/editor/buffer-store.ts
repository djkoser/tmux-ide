/**
 * Buffer store — Solid signal-backed state for the multi-tab
 * editor surface.
 *
 * Tracks every open file: current content, last-saved content,
 * dirty bit, status, and the open order (drives the tab strip's
 * left-to-right ordering). The store is module-singleton so the
 * tab strip, the editor host, and the Cmd+S keybind all read the
 * same source.
 *
 * Responsibility split:
 *   - This store owns content + dirty state + the open-order array.
 *   - `modelRegistry` (G17-P1) owns the Monaco `ITextModel`
 *     lifetime, view-state preservation across `attach()` swaps,
 *     and the 60s eviction TTL.
 *   - `CodeEditor` (G17-P4) attaches the registry's model to a
 *     leased editor; on edit it calls back into this store.
 *
 * Save flow:
 *   user types → Monaco onChange → bufferStore.markContent(uri,
 *   content) → setDirty(true) → tab strip's `•` lights up. User
 *   hits Cmd+S → bufferStore.save(uri) → PUT /api/project/:name
 *   /file → on success, baseContent ← content, dirty ← false.
 */

import { createStore, type SetStoreFunction } from "solid-js/store";
import { batch } from "solid-js";
import { Effect } from "effect";
import { saveFile } from "@/lib/api";
import { modelRegistry } from "@/lib/monaco/model-registry";
import { buildMonacoModelPath } from "@/lib/monaco/model-path";

export type BufferStatus = "loading" | "ready" | "error";

export interface OpenBuffer {
  bufferUri: string;
  filePath: string;
  sessionName: string;
  rootPath: string;
  language: string;
  status: BufferStatus;
  /** Current in-editor content. */
  content: string;
  /** Last-saved content; `dirty` derives from `content !== baseContent`. */
  baseContent: string;
  dirty: boolean;
  openedAt: number;
  lastSavedAt: number | null;
  saveError: string | null;
  saving: boolean;
}

export interface BufferStoreState {
  buffers: Record<string, OpenBuffer>;
  /** Open order — drives the tab strip left-to-right. */
  order: string[];
  /** Active buffer URI; null when no buffer is selected. */
  activeUri: string | null;
}

const [state, setState] = createStore<BufferStoreState>({
  buffers: {},
  order: [],
  activeUri: null,
});

export const bufferState = state;

export function getActiveBuffer(): OpenBuffer | null {
  const uri = state.activeUri;
  return uri ? state.buffers[uri] ?? null : null;
}

export function setActiveBuffer(uri: string | null): void {
  setState("activeUri", uri);
}

/**
 * Open (or focus) a buffer for `filePath`. If the buffer is already
 * open, just flips `activeUri`. Otherwise inserts a `loading` entry
 * and lets the caller hydrate via `markReady` once content arrives.
 */
export function openBuffer(input: {
  sessionName: string;
  rootPath: string;
  filePath: string;
  language: string;
}): { bufferUri: string; existed: boolean } {
  const bufferUri = buildMonacoModelPath(input.rootPath, input.filePath);
  const existing = state.buffers[bufferUri];
  if (existing) {
    setState("activeUri", bufferUri);
    return { bufferUri, existed: true };
  }

  batch(() => {
    setState("buffers", bufferUri, {
      bufferUri,
      filePath: input.filePath,
      sessionName: input.sessionName,
      rootPath: input.rootPath,
      language: input.language,
      status: "loading",
      content: "",
      baseContent: "",
      dirty: false,
      openedAt: Date.now(),
      lastSavedAt: null,
      saveError: null,
      saving: false,
    });
    setState("order", (order) => [...order, bufferUri]);
    setState("activeUri", bufferUri);
  });
  return { bufferUri, existed: false };
}

/**
 * Hydrate a buffer with its fetched initial content + register a
 * writable Monaco model behind the buffer URI. Flips status to
 * `'ready'`.
 */
export function markReady(bufferUri: string, initialContent: string): void {
  const buf = state.buffers[bufferUri];
  if (!buf) return;
  try {
    modelRegistry.registerBuffer({
      sessionName: buf.sessionName,
      rootPath: buf.rootPath,
      filePath: buf.filePath,
      language: buf.language,
      initialContent,
    });
  } catch (err) {
    setState("buffers", bufferUri, {
      ...buf,
      status: "error",
      saveError: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  batch(() => {
    setState("buffers", bufferUri, {
      ...buf,
      status: "ready",
      content: initialContent,
      baseContent: initialContent,
      dirty: false,
    });
  });
}

/** Mark a buffer as failed to load (the host's fetch path errored). */
export function markError(bufferUri: string, message: string): void {
  const buf = state.buffers[bufferUri];
  if (!buf) return;
  setState("buffers", bufferUri, {
    ...buf,
    status: "error",
    saveError: message,
  });
}

/**
 * Apply an in-editor content change. Updates `content`, recomputes
 * `dirty`, bumps the Monaco buffer-version signal (so other readers
 * of `useBufferVersion(uri)` re-run), and lights the registry's
 * dirty bit.
 */
export function markContent(bufferUri: string, nextContent: string): void {
  const buf = state.buffers[bufferUri];
  if (!buf || buf.status !== "ready") return;
  if (buf.content === nextContent) return;
  const dirty = nextContent !== buf.baseContent;
  batch(() => {
    setState("buffers", bufferUri, {
      ...buf,
      content: nextContent,
      dirty,
    });
    modelRegistry.setDirty(bufferUri, dirty);
    modelRegistry.bumpBufferVersion(bufferUri);
  });
}

/**
 * Persist a buffer's content to disk via the daemon. On success,
 * `baseContent ← content`, `dirty ← false`, `lastSavedAt` updates.
 * On failure, `saveError` is set; dirty remains true.
 */
export async function save(bufferUri: string): Promise<void> {
  const buf = state.buffers[bufferUri];
  if (!buf || buf.status !== "ready" || buf.saving) return;
  if (!buf.dirty) return; // nothing to write
  setState("buffers", bufferUri, { ...buf, saving: true, saveError: null });
  try {
    await Effect.runPromise(saveFile(buf.sessionName, buf.filePath, buf.content));
    const after = state.buffers[bufferUri];
    if (!after) return;
    batch(() => {
      setState("buffers", bufferUri, {
        ...after,
        baseContent: after.content,
        dirty: false,
        saving: false,
        saveError: null,
        lastSavedAt: Date.now(),
      });
      modelRegistry.setDirty(bufferUri, false);
    });
  } catch (err) {
    const after = state.buffers[bufferUri];
    if (!after) return;
    setState("buffers", bufferUri, {
      ...after,
      saving: false,
      saveError: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Close a buffer. If `discardDirty` is false (default), the call is
 * a no-op when the buffer is dirty — the host can prompt the user
 * before passing `discardDirty: true`. Drops the buffer's
 * registration via the model registry's 60s TTL.
 */
export function closeBuffer(bufferUri: string, opts: { discardDirty?: boolean } = {}): boolean {
  const buf = state.buffers[bufferUri];
  if (!buf) return false;
  if (buf.dirty && !opts.discardDirty) return false;
  const nextOrder = state.order.filter((u) => u !== bufferUri);
  const nextActive =
    state.activeUri === bufferUri ? (nextOrder[nextOrder.length - 1] ?? null) : state.activeUri;
  batch(() => {
    setState("buffers", bufferUri, undefined as unknown as OpenBuffer);
    setState("order", nextOrder);
    setState("activeUri", nextActive);
    modelRegistry.setDirty(bufferUri, false);
  });
  modelRegistry.unregisterModel(bufferUri);
  return true;
}

/** Test-only reset. */
export function __resetBufferStoreForTests(set?: SetStoreFunction<BufferStoreState>): void {
  void set; // unused — kept for signature parity with other test helpers
  setState({ buffers: {}, order: [], activeUri: null });
}
