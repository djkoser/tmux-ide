import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiStrip, type MissionKpis } from "../KpiStrip";

const KPIS: MissionKpis = {
  agentsActive: 2,
  agentsTotal: 4,
  tasksDone: 7,
  tasksTotal: 12,
  runtimeMs: 3_600_000 + 720_000, // 1h 12m
  estimatedCompletion: "May 5, 18:00",
};

describe("KpiStrip", () => {
  it("renders the four KPI cards with labels", () => {
    render(<KpiStrip kpis={KPIS} />);
    expect(screen.getByTestId("mission-kpi-strip")).toBeTruthy();
    expect(screen.getByTestId("kpi-agents")).toBeTruthy();
    expect(screen.getByTestId("kpi-tasks")).toBeTruthy();
    expect(screen.getByTestId("kpi-runtime")).toBeTruthy();
    expect(screen.getByTestId("kpi-eta")).toBeTruthy();
    expect(screen.getByText("Active agents")).toBeTruthy();
    expect(screen.getByText("Tasks done")).toBeTruthy();
    expect(screen.getByText("Runtime")).toBeTruthy();
    expect(screen.getByText("Est. completion")).toBeTruthy();
    expect(screen.getByText("May 5, 18:00")).toBeTruthy();
  });

  it("renders agents card as a button when onAgentsClick is provided", () => {
    const onClick = () => {};
    render(<KpiStrip kpis={KPIS} onAgentsClick={onClick} />);
    const agents = screen.getByTestId("kpi-agents");
    expect(agents.tagName).toBe("BUTTON");
  });
});
