import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentActivityRail } from "../AgentActivityRail";
import type { AgentDetail } from "@/lib/types";

const AGENTS: AgentDetail[] = [
  {
    paneTitle: "Frontend",
    paneId: "%1",
    isBusy: true,
    taskTitle: "Implement Mission view",
    taskId: "001",
    elapsed: "5m",
  },
  {
    paneTitle: "Validator",
    paneId: "%2",
    isBusy: false,
    taskTitle: null,
    taskId: null,
    elapsed: "0",
  },
];

describe("AgentActivityRail", () => {
  it("renders one row per agent with title, task, and elapsed", () => {
    render(<AgentActivityRail agents={AGENTS} />);
    expect(screen.getByTestId("mission-agent-rail")).toBeTruthy();
    expect(screen.getByTestId("agent-row-%1")).toBeTruthy();
    expect(screen.getByTestId("agent-row-%2")).toBeTruthy();
    expect(screen.getByText("Frontend")).toBeTruthy();
    expect(screen.getByText("Implement Mission view")).toBeTruthy();
    expect(screen.getByText("5m")).toBeTruthy();
  });

  it("calls onAgentClick when an agent row is clicked", async () => {
    const onAgentClick = vi.fn();
    render(<AgentActivityRail agents={AGENTS} onAgentClick={onAgentClick} />);
    const button = screen.getByTestId("agent-row-%1").querySelector("button");
    expect(button).toBeTruthy();
    await act(async () => {
      fireEvent.click(button!);
    });
    expect(onAgentClick).toHaveBeenCalledWith(AGENTS[0]);
  });

  it("shows an empty state when no agents", () => {
    render(<AgentActivityRail agents={[]} />);
    expect(screen.getByText("No agents online")).toBeTruthy();
  });
});
