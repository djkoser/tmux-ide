import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MilestoneLadder } from "../MilestoneLadder";
import type { MilestoneData } from "@/lib/api";
import type { Task } from "@/lib/types";

const MILESTONES: MilestoneData[] = [
  {
    id: "M1",
    title: "Foundation",
    description: "",
    status: "done",
    order: 1,
    taskCount: 3,
    tasksDone: 3,
  },
  {
    id: "M2",
    title: "Auth",
    description: "",
    status: "active",
    order: 2,
    taskCount: 4,
    tasksDone: 1,
  },
  {
    id: "M3",
    title: "Polish",
    description: "",
    status: "locked",
    order: 3,
    taskCount: 2,
    tasksDone: 0,
  },
];

function makeTask(id: string, milestone: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: "",
    goal: null,
    status: "todo",
    assignee: null,
    priority: 1,
    created: "",
    updated: "",
    tags: [],
    proof: null,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    nextRetryAt: null,
    depends_on: [],
    milestone,
    specialty: null,
    fulfills: [],
    discoveredIssues: [],
    salientSummary: null,
  };
}

describe("MilestoneLadder", () => {
  it("renders all milestone stations sorted by order", () => {
    const tasksByM = new Map([
      ["M2", [makeTask("001", "M2"), makeTask("002", "M2")]],
    ]);
    render(<MilestoneLadder milestones={MILESTONES} tasksByMilestone={tasksByM} />);

    expect(screen.getByTestId("mission-milestone-ladder")).toBeTruthy();
    expect(screen.getByTestId("milestone-station-M1")).toBeTruthy();
    expect(screen.getByTestId("milestone-station-M2")).toBeTruthy();
    expect(screen.getByTestId("milestone-station-M3")).toBeTruthy();
    expect(screen.getByText("Foundation")).toBeTruthy();
    expect(screen.getByText("Auth")).toBeTruthy();
    expect(screen.getByText("Polish")).toBeTruthy();
  });

  it("expands a station and reveals its tasks on click", async () => {
    const tasksByM = new Map([
      ["M2", [makeTask("001", "M2"), makeTask("002", "M2")]],
    ]);
    render(<MilestoneLadder milestones={MILESTONES} tasksByMilestone={tasksByM} />);

    const button = screen.getByTestId("milestone-button-M2");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("milestone-task-001")).toBeTruthy();
    expect(screen.getByTestId("milestone-task-002")).toBeTruthy();
  });

  it("returns null when no milestones present", () => {
    const { container } = render(
      <MilestoneLadder milestones={[]} tasksByMilestone={new Map()} />,
    );
    expect(container.querySelector("[data-testid='mission-milestone-ladder']")).toBeNull();
  });
});
