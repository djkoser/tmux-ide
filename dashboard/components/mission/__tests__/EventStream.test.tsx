import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventStream, groupByMinute } from "../EventStream";
import type { EventData } from "@/lib/api";

function makeEvent(timestamp: string, type: string, message: string, agent?: string): EventData {
  return { timestamp, type, message, agent, relative: "1m ago" };
}

describe("groupByMinute", () => {
  it("buckets events by ISO minute boundary", () => {
    const events = [
      makeEvent("2026-05-03T14:32:05Z", "dispatch", "a"),
      makeEvent("2026-05-03T14:32:50Z", "completion", "b"),
      makeEvent("2026-05-03T14:33:01Z", "retry", "c"),
    ];
    const groups = groupByMinute(events);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.events).toHaveLength(2);
    expect(groups[1]!.events).toHaveLength(1);
  });
});

describe("EventStream", () => {
  it("renders activity events grouped by minute", () => {
    const events = [
      makeEvent("2026-05-03T14:32:05Z", "dispatch", "Sent task"),
      makeEvent("2026-05-03T14:32:50Z", "completion", "Done"),
      makeEvent("2026-05-03T14:30:00Z", "retry", "retry once"),
    ];
    render(<EventStream events={events} />);
    expect(screen.getByTestId("mission-event-stream")).toBeTruthy();
    // Two buckets: 14:32 (2 events, collapsible) + 14:30 (1 event, no toggle)
    const buckets = screen.getAllByTestId(/^event-bucket-(?!toggle-)/);
    expect(buckets.length).toBe(2);
  });

  it("collapses and expands a bucket containing multiple events", async () => {
    const events = [
      makeEvent("2026-05-03T14:32:05Z", "dispatch", "Sent task"),
      makeEvent("2026-05-03T14:32:50Z", "completion", "Done"),
    ];
    render(<EventStream events={events} />);
    const toggles = screen.getAllByTestId(/event-bucket-toggle-/);
    expect(toggles).toHaveLength(1);
    const toggle = toggles[0]!;
    expect(toggle.getAttribute("data-testid")).toMatch(/^event-bucket-toggle-/);
    // Default (more than 1 event) starts collapsed in our implementation
    expect(screen.queryByText("Sent task")).toBeNull();
    await act(async () => {
      fireEvent.click(toggle);
    });
    // Now expanded
    expect(screen.getByText("Sent task")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("shows empty state when no events", () => {
    render(<EventStream events={[]} />);
    expect(screen.getByText("No recent activity")).toBeTruthy();
  });
});
