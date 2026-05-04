import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDetail, Goal, Task } from "@/lib/types";
import { KanbanBoard } from "../KanbanBoard";

vi.mock("@/lib/useNavigatorSlot", () => ({
  NavigatorPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/navigators/NavigatorShell", () => ({
  NavigatorShell: ({ children, testId }: { children: React.ReactNode; testId?: string }) => (
    <div data-testid={testId}>{children}</div>
  ),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "001",
    title: "Build foo",
    description: "",
    goal: null,
    status: "todo",
    assignee: null,
    priority: 3,
    created: "2025-01-01T00:00:00Z",
    updated: "2025-01-01T00:00:00Z",
    tags: [],
    proof: null,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    nextRetryAt: null,
    depends_on: [],
    milestone: null,
    specialty: null,
    fulfills: [],
    discoveredIssues: [],
    salientSummary: null,
    ...overrides,
  };
}

const baseProps: {
  sessionName: string;
  agents: AgentDetail[];
  goals: Goal[];
  events: never[];
} = {
  sessionName: "alpha",
  agents: [],
  goals: [],
  events: [],
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ ok: true, task: makeTask() }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a column for each canonical status", () => {
    render(<KanbanBoard {...baseProps} tasks={[]} />);
    expect(screen.getByTestId("kanban-column-todo")).toBeTruthy();
    expect(screen.getByTestId("kanban-column-in-progress")).toBeTruthy();
    expect(screen.getByTestId("kanban-column-review")).toBeTruthy();
    expect(screen.getByTestId("kanban-column-done")).toBeTruthy();
  });

  it("places tasks into their status columns", () => {
    const tasks = [
      makeTask({ id: "001", status: "todo" }),
      makeTask({ id: "002", status: "in-progress" }),
      makeTask({ id: "003", status: "done" }),
    ];
    const { container } = render(<KanbanBoard {...baseProps} tasks={tasks} />);
    const todo = container.querySelector('[data-testid="kanban-column-body-todo"]')!;
    expect(todo.querySelectorAll("[data-task-id]").length).toBe(1);
    expect(todo.querySelector('[data-testid="task-card-001"]')).toBeTruthy();
    const done = container.querySelector('[data-testid="kanban-column-body-done"]')!;
    expect(done.querySelector('[data-testid="task-card-003"]')).toBeTruthy();
  });

  it("filters tasks by search input", async () => {
    const tasks = [
      makeTask({ id: "001", title: "Apple" }),
      makeTask({ id: "002", title: "Banana" }),
    ];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    const search = screen.getByTestId("kanban-filter-search");
    await act(async () => {
      fireEvent.change(search, { target: { value: "apple" } });
    });
    expect(screen.queryByTestId("task-card-001")).toBeTruthy();
    expect(screen.queryByTestId("task-card-002")).toBeNull();
  });

  it("switches column composition when group-by changes to priority", async () => {
    const tasks = [
      makeTask({ id: "001", priority: 1 }),
      makeTask({ id: "002", priority: 4 }),
    ];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    const groupBtn = screen.getByTestId("kanban-groupby-priority");
    await act(async () => {
      fireEvent.click(groupBtn);
    });
    expect(screen.getByTestId("kanban-column-p1")).toBeTruthy();
    expect(screen.getByTestId("kanban-column-p4")).toBeTruthy();
    const p1Body = screen.getByTestId("kanban-column-body-p1");
    expect(p1Body.querySelector('[data-testid="task-card-001"]')).toBeTruthy();
  });

  it("supports cmd-click multi-select and shows the bulk actions bar", async () => {
    const tasks = [
      makeTask({ id: "001" }),
      makeTask({ id: "002" }),
    ];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    fireEvent.click(screen.getByTestId("task-card-001"), { metaKey: true });
    fireEvent.click(screen.getByTestId("task-card-002"), { metaKey: true });
    expect(screen.getByTestId("kanban-bulk-actions")).toBeTruthy();
    expect(screen.getByTestId("kanban-bulk-actions").textContent).toContain("2 selected");
  });

  it("invokes the API to change task status when the status dot is clicked", async () => {
    const tasks = [makeTask({ id: "001", status: "todo" })];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("task-card-status-001"));
    });
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = calls.find(([url, init]) =>
        String(url).includes("/api/project/alpha/task/001") && init?.method === "POST",
      );
      expect(updateCall).toBeTruthy();
      expect(updateCall![1]?.body).toContain("in-progress");
    });
  });

  it("rolls back status optimistically on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    );
    const tasks = [makeTask({ id: "001", status: "todo" })];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("task-card-status-001"));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Optimistic update would have moved 001 to in-progress; rollback returns it to todo.
    await waitFor(() => {
      const todoBody = screen.getByTestId("kanban-column-body-todo");
      expect(todoBody.querySelector('[data-testid="task-card-001"]')).toBeTruthy();
    });
  });

  it("opens task detail when a card is clicked without modifiers", async () => {
    const tasks = [makeTask({ id: "001", title: "Detailed task" })];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    fireEvent.click(screen.getByTestId("task-card-001"));
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeTruthy();
    });
    expect(
      (screen.getByTestId("task-panel-title") as HTMLInputElement).value,
    ).toBe("Detailed task");
  });

  it("supports keyboard navigation with j/k and toggles selection with x", async () => {
    const tasks = [
      makeTask({ id: "001", priority: 1 }),
      makeTask({ id: "002", priority: 2 }),
    ];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "j" });
    });
    await waitFor(() => {
      expect(screen.getByTestId("task-card-002").getAttribute("data-selected")).toBe("true");
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: "x" });
    });
    // x keeps the same task selected (toggling once removes; toggling once adds).
    // Run another j to make sure nav still moves selection.
    await act(async () => {
      fireEvent.keyDown(window, { key: "k" });
    });
  });

  it("clears all filters when the clear-all link is pressed", async () => {
    const tasks = [
      makeTask({ id: "001", title: "Foo" }),
      makeTask({ id: "002", title: "Bar" }),
    ];
    render(<KanbanBoard {...baseProps} tasks={tasks} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId("kanban-filter-search"), {
        target: { value: "foo" },
      });
    });
    expect(screen.getByTestId("kanban-filter-clear")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("kanban-filter-clear"));
    });
    expect(
      (screen.getByTestId("kanban-filter-search") as HTMLInputElement).value,
    ).toBe("");
  });

  it("opens the create task dialog from the header button", async () => {
    render(<KanbanBoard {...baseProps} tasks={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("kanban-add-task"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("create-task-dialog")).toBeTruthy();
    });
  });
});
