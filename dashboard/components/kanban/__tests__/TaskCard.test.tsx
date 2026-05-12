import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";
import { TaskCard } from "../TaskCard";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "001",
    title: "Sample task",
    description: "Description",
    goal: null,
    status: "todo",
    assignee: null,
    priority: 2,
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

function renderCard(task: Task, props: Partial<Parameters<typeof TaskCard>[0]> = {}) {
  return render(
    <DndContext>
      <SortableContext items={[task.id]}>
        <TaskCard task={task} density="comfortable" selected={false} blocked={false} {...props} />
      </SortableContext>
    </DndContext>,
  );
}

describe("TaskCard", () => {
  it("renders id, title, milestone and priority", () => {
    const task = makeTask({ milestone: "M2" });
    renderCard(task);
    expect(screen.getByTestId("task-card-001")).toBeTruthy();
    expect(screen.getByText("Sample task")).toBeTruthy();
    expect(screen.getByTestId("task-card-milestone-001").textContent).toBe("M2");
    expect(screen.getByText("P2")).toBeTruthy();
  });

  it("invokes onOpen when clicked without modifiers", () => {
    const onOpen = vi.fn();
    renderCard(makeTask(), { onOpen });
    fireEvent.click(screen.getByTestId("task-card-001"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("invokes onSelect (not onOpen) when clicked with the meta key", () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    renderCard(makeTask(), { onOpen, onSelect });
    fireEvent.click(screen.getByTestId("task-card-001"), { metaKey: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("cycles status when the status dot is clicked", () => {
    const onStatusChange = vi.fn();
    renderCard(makeTask({ status: "todo" }), { onStatusChange });
    fireEvent.click(screen.getByTestId("task-card-status-001"));
    expect(onStatusChange).toHaveBeenCalledWith("in-progress");
  });

  it("renders a Blocked badge when blocked is true", () => {
    renderCard(makeTask(), { blocked: true });
    expect(screen.getByTestId("task-card-blocked-001")).toBeTruthy();
  });

  it("renders a dependency count badge", () => {
    renderCard(makeTask({ depends_on: ["010", "011"] }));
    expect(screen.getByTestId("task-card-deps-001").textContent).toContain("2");
  });
});
