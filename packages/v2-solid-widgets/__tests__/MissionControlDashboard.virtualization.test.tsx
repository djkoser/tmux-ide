/**
 * Contracts test for the virtualized MissionControl event stream.
 *
 * The widget caps the visible event count at `eventLimit` (default
 * 20). When the host passes a large limit (e.g. after the user
 * clicks "show all"), the events render inside a max-height: 400px
 * scroll region that virtualizes the row list so the dashboard
 * doesn't pay for thousands of event divs.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { MissionControlDashboardView } from "../src/widgets/MissionControlDashboard";
import type {
  DashboardEvent,
  MissionControlDashboardMountOptions,
  MissionControlDashboardSnapshot,
} from "../src/types";

function ev(i: number): DashboardEvent {
  return {
    type: "dispatch",
    relative: `${i}s`,
    agent: `agent-${i % 4}`,
    message: `event ${i}`,
  };
}

function snapshot(events: DashboardEvent[]): MissionControlDashboardSnapshot {
  return {
    mission: {
      title: "Test mission",
      status: "active",
      description: "test",
    },
    milestones: [],
    agents: [],
    events,
    kpis: { agentsActive: 0, tasksDone: 0, runtime: "0", validationPercent: 0 },
    validation: null,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MissionControlDashboard event-stream virtualization", () => {
  it("renders only a viewport-sized window for a high event limit", () => {
    const events = Array.from({ length: 5000 }, (_, i) => ev(i));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [opts] = createSignal<MissionControlDashboardMountOptions>({
      snapshot: snapshot(events),
      eventLimit: 5000,
    });
    const dispose = render(() => <MissionControlDashboardView options={opts} />, container);

    const eventNodes = container.querySelectorAll<HTMLElement>("[data-index]");
    expect(eventNodes.length).toBeGreaterThan(0);
    expect(eventNodes.length).toBeLessThan(200);

    const spacer = container.querySelector<HTMLElement>(
      "[data-testid='mission-control-events-spacer']",
    );
    expect(spacer).toBeTruthy();
    const h = parseInt(spacer!.style.height, 10);
    // 5000 × ~26px = 130000 px of virtual content.
    expect(h).toBeGreaterThan(100_000);

    dispose();
  });
});
