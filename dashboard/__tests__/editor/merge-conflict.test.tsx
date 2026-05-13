/**
 * G17-P7 — three-way merge UI tests.
 *
 * Covers:
 *   - `resolveConflict` buffer-store action wiring (content
 *     swap, externalContent clear, dirty recompute, autosave
 *     scheduling).
 *   - `<MergeConflictPanel>` render + action callbacks.
 *
 * Monaco + `<DiffPreview>` are stubbed so the panel mounts under
 * happy-dom without the editor bundle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { Effect } from "effect";

const mockSaveFile = vi.fn();
vi.mock("@/lib/api", () => ({
  API_BASE: "",
  ApiError: class ApiError extends Error {
    status = 0;
  },
  saveFile: (...args: unknown[]) => mockSaveFile(...args),
  fetchFilePreview: vi.fn(),
  fetchGitFile: vi.fn(),
  fetchProjectFiles: vi.fn(),
}));

// Stub `<DiffPreview>` so the merge panel mounts without touching
// `monaco.editor.createDiffEditor`. We only care about the panel's
// wiring + the buffer-store flow.
vi.mock("@/components/editor/DiffPreview", () => ({
  DiffPreview: (props: { id: string; original: string; modified: string }) => (
    <div
      data-testid="diff-preview-stub"
      data-diff-preview-id={props.id}
      data-original={props.original}
      data-modified={props.modified}
    />
  ),
}));

const stubModels = new Map<string, { _value: string; getValue(): string; setValue(v: string): void; dispose(): void }>();
const stubMonaco = {
  Uri: { parse: (s: string) => ({ _raw: s, toString: () => s }) },
  editor: {
    getModel: (uri: { _raw: string }) => stubModels.get(uri._raw),
    createModel: (value: string, _lang: string, uri: { _raw: string }) => {
      const m = {
        _value: value,
        getValue() {
          return this._value;
        },
        setValue(v: string) {
          this._value = v;
        },
        dispose() {
          stubModels.delete(uri._raw);
        },
      };
      stubModels.set(uri._raw, m);
      return m;
    },
  },
};

import {
  __resetBufferStoreForTests,
  _getAutosaveWindowMsForTests,
  _hasPendingAutosaveForTests,
  bufferState,
  markContent,
  markReady,
  openBuffer,
  reseedFromExternal,
  resolveConflict,
} from "@/lib/editor/buffer-store";
import { MergeConflictPanel } from "@/components/editor/MergeConflictPanel";
import { modelRegistry } from "@/lib/monaco/model-registry";

beforeEach(() => {
  (globalThis as unknown as { __monaco: typeof stubMonaco }).__monaco = stubMonaco;
  modelRegistry.notifyMonacoReady(
    stubMonaco as unknown as Parameters<typeof modelRegistry.notifyMonacoReady>[0],
  );
  modelRegistry._resetForTests();
  __resetBufferStoreForTests();
  stubModels.clear();
  mockSaveFile.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  __resetBufferStoreForTests();
  modelRegistry._resetForTests();
});

function openConflict(opts?: { language?: string }) {
  const { bufferUri } = openBuffer({
    sessionName: "smoke",
    rootPath: "/repo",
    filePath: "src/x.ts",
    language: opts?.language ?? "typescript",
  });
  markReady(bufferUri, "base content\n");
  markContent(bufferUri, "my local edits\n");
  reseedFromExternal(bufferUri, "external rewrite\n");
  return bufferUri;
}

describe("resolveConflict (buffer-store)", () => {
  it("swaps buffer content to the merged value + clears externalContent", () => {
    const uri = openConflict();
    resolveConflict(uri, "merged result\n");
    const buf = bufferState.buffers[uri]!;
    expect(buf.content).toBe("merged result\n");
    expect(buf.externalContent).toBeNull();
    // baseContent stays at the previous on-disk snapshot; the
    // user's save flow promotes the merged result to disk.
    expect(buf.baseContent).toBe("base content\n");
    expect(buf.dirty).toBe(true);
    expect(modelRegistry.getValue(uri)).toBe("merged result\n");
    expect(modelRegistry.isDirty(uri)).toBe(true);
  });

  it("clears dirty when merged result matches baseContent", () => {
    const uri = openConflict();
    resolveConflict(uri, "base content\n");
    const buf = bufferState.buffers[uri]!;
    expect(buf.content).toBe("base content\n");
    expect(buf.dirty).toBe(false);
    expect(buf.externalContent).toBeNull();
    expect(modelRegistry.isDirty(uri)).toBe(false);
  });

  it("schedules autosave when the resolved merge remains dirty", async () => {
    vi.useFakeTimers();
    mockSaveFile.mockReturnValue(Effect.succeed({ ok: true, path: "src/x.ts", bytes: 0 }));
    const uri = openConflict();
    resolveConflict(uri, "merged result\n");
    expect(_hasPendingAutosaveForTests(uri)).toBe(true);
    await vi.advanceTimersByTimeAsync(_getAutosaveWindowMsForTests() + 50);
    expect(mockSaveFile).toHaveBeenCalledWith("smoke", "src/x.ts", "merged result\n");
  });

  it("is a no-op for an unknown buffer URI", () => {
    expect(() => resolveConflict("file:///nope", "anything")).not.toThrow();
  });
});

describe("MergeConflictPanel render + actions", () => {
  it("renders all three sections + diff previews seeded with base/external/local", () => {
    const uri = openConflict();
    const buf = bufferState.buffers[uri]!;
    const { getByTestId, getAllByTestId } = render(() => (
      <MergeConflictPanel buffer={buf} />
    ));
    expect(getByTestId("v2-merge-conflict-panel").getAttribute("data-buffer-uri")).toBe(uri);
    expect(getByTestId("v2-merge-section-theirs")).toBeInTheDocument();
    expect(getByTestId("v2-merge-section-yours")).toBeInTheDocument();
    expect(getByTestId("v2-merge-section-merged")).toBeInTheDocument();
    const diffs = getAllByTestId("diff-preview-stub");
    expect(diffs).toHaveLength(2);
    const theirs = diffs.find((d) =>
      d.getAttribute("data-diff-preview-id")?.endsWith("-theirs"),
    );
    const yours = diffs.find((d) =>
      d.getAttribute("data-diff-preview-id")?.endsWith("-yours"),
    );
    expect(theirs?.getAttribute("data-original")).toBe("base content\n");
    expect(theirs?.getAttribute("data-modified")).toBe("external rewrite\n");
    expect(yours?.getAttribute("data-original")).toBe("base content\n");
    expect(yours?.getAttribute("data-modified")).toBe("my local edits\n");
  });

  it("seed-from-external button replaces the merged textarea with the external content", () => {
    const uri = openConflict();
    const buf = bufferState.buffers[uri]!;
    const { getByTestId } = render(() => <MergeConflictPanel buffer={buf} />);
    const textarea = getByTestId("v2-merge-merged-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe("my local edits\n");
    fireEvent.click(getByTestId("v2-merge-seed-external"));
    expect(textarea.value).toBe("external rewrite\n");
  });

  it("Apply merged calls resolveConflict with the textarea content", () => {
    const uri = openConflict();
    const buf = bufferState.buffers[uri]!;
    const { getByTestId } = render(() => <MergeConflictPanel buffer={buf} />);
    const textarea = getByTestId("v2-merge-merged-input") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "hand-merged content\n" } });
    fireEvent.click(getByTestId("v2-merge-apply"));
    const after = bufferState.buffers[uri]!;
    expect(after.content).toBe("hand-merged content\n");
    expect(after.externalContent).toBeNull();
    expect(after.dirty).toBe(true);
  });

  it("Use external runs acceptExternalChange (drops local edits)", () => {
    const uri = openConflict();
    const buf = bufferState.buffers[uri]!;
    const { getByTestId } = render(() => <MergeConflictPanel buffer={buf} />);
    fireEvent.click(getByTestId("v2-merge-use-external"));
    const after = bufferState.buffers[uri]!;
    expect(after.content).toBe("external rewrite\n");
    expect(after.baseContent).toBe("external rewrite\n");
    expect(after.dirty).toBe(false);
    expect(after.externalContent).toBeNull();
  });

  it("Use mine runs dismissExternalChange (keeps local edits)", () => {
    const uri = openConflict();
    const buf = bufferState.buffers[uri]!;
    const { getByTestId } = render(() => <MergeConflictPanel buffer={buf} />);
    fireEvent.click(getByTestId("v2-merge-use-mine"));
    const after = bufferState.buffers[uri]!;
    expect(after.content).toBe("my local edits\n");
    expect(after.dirty).toBe(true);
    expect(after.externalContent).toBeNull();
  });
});
