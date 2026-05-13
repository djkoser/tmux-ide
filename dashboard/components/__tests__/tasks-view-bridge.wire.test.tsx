/**
 * Wire-coverage for TasksViewBridge (T1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";
import { TasksViewBridge } from "@/components/tasks-view-bridge";

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

interface TasksCaptured {
  onTaskClick?: (id: string) => void;
  onCreateTask?: () => void;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("TasksViewBridge — wire", () => {
  it("onTaskClick rewrites URL with tab=kanban and task=ID + fires popstate", async () => {
    mockFetchOk();
    render(<TasksViewBridge projectName="proj" tasks={[]} />);
    const opts = await waitForCapture<TasksCaptured>("TasksView");

    const popstateSpy = vi.fn();
    window.addEventListener("popstate", popstateSpy);
    try {
      opts.onTaskClick!("t-7");
      expect(window.location.search).toContain("tab=kanban");
      expect(window.location.search).toContain("task=t-7");
      expect(popstateSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("popstate", popstateSpy);
    }
  });

  it("onCreateTask invokes the host callback", async () => {
    mockFetchOk();
    const onCreateTask = vi.fn();
    render(
      <TasksViewBridge
        projectName="proj"
        tasks={[]}
        onCreateTask={onCreateTask}
      />,
    );
    const opts = await waitForCapture<TasksCaptured>("TasksView");
    opts.onCreateTask!();
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });
});
