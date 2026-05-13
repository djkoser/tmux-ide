/**
 * Wire-coverage for CostsDashboardBridge (T1).
 *
 * The bridge has no user-facing buttons — but its raison d'être is the
 * metrics fetch + snapshot push that replaced 5s polling. Wire test:
 *   - mount issues `fetchMetrics(:name)` against the daemon.
 *   - the fetched payload is pushed into the widget as snapshot.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
  getCaptured,
} from "@/lib/test/wireTest";

vi.mock("@/lib/wsBus", () => ({
  subscribeSession: () => () => undefined,
}));

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

import { CostsDashboardBridge } from "@/components/costs-dashboard-bridge";

interface CostsCaptured {
  snapshot?: {
    session?: unknown;
    tasks?: unknown;
    agents?: unknown;
    mission?: unknown;
    timeline?: unknown;
  } | null;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("CostsDashboardBridge — wire", () => {
  it("mount fetches /api/project/:name/metrics", async () => {
    const metricsPayload = {
      session: { sessionName: "proj", totalCost: 0 },
      tasks: [],
      agents: [],
      mission: null,
      timeline: [],
    };
    const fetchMock = mockFetchOk({ json: metricsPayload });
    render(<CostsDashboardBridge projectName="proj" />);
    await waitForCapture<CostsCaptured>("CostsDashboard");

    const metricsCall = fetchMock.mock.calls.find(([url]) =>
      typeof url === "string" && url.includes("/api/project/proj/metrics"),
    );
    expect(metricsCall).toBeDefined();
  });

  it("pushes the fetched metrics into the widget as snapshot", async () => {
    const metricsPayload = {
      session: { sessionName: "proj", totalCost: 1.23 },
      tasks: [{ id: "t1" }],
      agents: [{ paneId: "p1" }],
      mission: null,
      timeline: [],
    };
    mockFetchOk({ json: metricsPayload });
    render(<CostsDashboardBridge projectName="proj" />);
    await waitForCapture<CostsCaptured>("CostsDashboard");

    // Wait an extra beat for the post-fetch setOptions push.
    await new Promise((r) => setTimeout(r, 30));
    const opts = getCaptured<CostsCaptured>("CostsDashboard");
    expect(opts?.snapshot).toBeTruthy();
    expect(opts?.snapshot?.session).toEqual({ sessionName: "proj", totalCost: 1.23 });
  });
});
