/**
 * Wire-coverage for KanbanBoardBridge (T1).
 *
 * Asserts the bridge's mount-options handlers hit the right wire:
 *   - onTaskStatusChange → POST /api/project/:name/task/:id
 *   - onTaskClick        → URL update + popstate dispatch
 *   - onCreateTask       → CreateTaskDialog opens (data-testid mount)
 *
 * See dashboard/lib/test/README.md for the pattern.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";
import { KanbanBoardBridge } from "@/components/kanban-board-bridge";

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

// CreateTaskDialog itself fetches goals etc. — stub to a marker render
// so the bridge's onCreateTask state-toggle is observable without
// dragging the real dialog tree into this test.
vi.mock("@/components/kanban/CreateTaskDialog", () => ({
  CreateTaskDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-task-dialog-stub" /> : null,
}));

interface KanbanCaptured {
  onTaskStatusChange?: (id: string, status: string) => Promise<void>;
  onTaskClick?: (id: string) => void;
  onCreateTask?: () => void;
  tasks?: ReadonlyArray<{ id: string }>;
}

beforeEach(() => {
  clearCaptures();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KanbanBoardBridge — wire", () => {
  it("onTaskStatusChange POSTs to /api/project/:name/task/:id with status body", async () => {
    const fetchMock = mockFetchOk({
      json: { ok: true, task: { id: "t1", status: "done" } },
    });
    render(<KanbanBoardBridge sessionName="proj" tasks={[]} goals={[]} />);
    const opts = await waitForCapture<KanbanCaptured>("KanbanBoard");
    await opts.onTaskStatusChange!("t1", "done");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/project\/proj\/task\/t1$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ status: "done" });
  });

  it("onTaskClick rewrites the URL and dispatches a popstate event", async () => {
    mockFetchOk();
    render(<KanbanBoardBridge sessionName="proj" tasks={[]} goals={[]} />);
    const opts = await waitForCapture<KanbanCaptured>("KanbanBoard");

    const popstateSpy = vi.fn();
    window.addEventListener("popstate", popstateSpy);
    try {
      opts.onTaskClick!("t-42");
      expect(window.location.search).toContain("tab=kanban");
      expect(window.location.search).toContain("task=t-42");
      expect(popstateSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("popstate", popstateSpy);
    }
  });

  it("onCreateTask opens the CreateTaskDialog", async () => {
    mockFetchOk();
    const { findByTestId, queryByTestId } = render(
      <KanbanBoardBridge sessionName="proj" tasks={[]} goals={[]} />,
    );
    const opts = await waitForCapture<KanbanCaptured>("KanbanBoard");
    expect(queryByTestId("create-task-dialog-stub")).toBeNull();
    await act(async () => {
      opts.onCreateTask!();
    });

    expect(await findByTestId("create-task-dialog-stub")).toBeTruthy();
  });
});
