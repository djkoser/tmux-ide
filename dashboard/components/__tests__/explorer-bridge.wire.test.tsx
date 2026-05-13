/**
 * Wire-coverage for ExplorerBridge (T1).
 *
 * The widget reports a (path, isDir) tuple; the bridge re-resolves the
 * entry by walking its rootEntries tree, then forwards (path, entry)
 * to the host's onSelect. Wire test: walk the resolution + forward.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";
import { ExplorerBridge, type FileTreeEntry } from "@/components/explorer-bridge";

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

interface ExplorerCaptured {
  onSelect?: (path: string, isDir: boolean) => void;
  selectedPath?: string | null;
  rootEntries?: ReadonlyArray<FileTreeEntry>;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

const tree: FileTreeEntry[] = [
  {
    name: "src",
    path: "src",
    isDir: true,
    children: [
      { name: "app.ts", path: "src/app.ts", isDir: false },
      { name: "lib", path: "src/lib", isDir: true, children: [] },
    ],
  },
  { name: "README.md", path: "README.md", isDir: false },
];

describe("ExplorerBridge — wire", () => {
  it("forwards file clicks with the full entry resolved from rootEntries", async () => {
    mockFetchOk();
    const onSelect = vi.fn();
    render(
      <ExplorerBridge
        rootEntries={tree}
        selectedPath={null}
        onSelect={onSelect}
      />,
    );
    const opts = await waitForCapture<ExplorerCaptured>("ExplorerDashboard");
    opts.onSelect!("src/app.ts", false);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe("src/app.ts");
    expect(onSelect.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ path: "src/app.ts", isDir: false }),
    );
  });

  it("forwards directory clicks (the host decides whether to load preview)", async () => {
    mockFetchOk();
    const onSelect = vi.fn();
    render(
      <ExplorerBridge
        rootEntries={tree}
        selectedPath={null}
        onSelect={onSelect}
      />,
    );
    const opts = await waitForCapture<ExplorerCaptured>("ExplorerDashboard");
    opts.onSelect!("src/lib", true);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ path: "src/lib", isDir: true }),
    );
  });

  it("ignores clicks on paths missing from the tree (defensive)", async () => {
    mockFetchOk();
    const onSelect = vi.fn();
    render(
      <ExplorerBridge
        rootEntries={tree}
        selectedPath={null}
        onSelect={onSelect}
      />,
    );
    const opts = await waitForCapture<ExplorerCaptured>("ExplorerDashboard");
    opts.onSelect!("does/not/exist", false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
