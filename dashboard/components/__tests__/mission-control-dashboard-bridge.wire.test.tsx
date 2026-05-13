/**
 * Wire-coverage for MissionControlDashboardBridge (T1).
 *
 * Three forwarded callbacks: onTaskClick, onAgentClick, onShowAllEvents.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";

// useSessionStream subscribes to the WS bus + fetches snapshot data.
// Stub to a stable empty snapshot so the bridge mounts deterministically.
vi.mock("@/lib/useSessionStream", () => ({
  useSessionStream: () => ({
    snapshot: {
      mission: null,
      milestones: [],
      tasks: [],
      agents: [],
      events: [],
    },
  }),
}));

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

import { MissionControlDashboardBridge } from "@/components/mission-control-dashboard-bridge";

interface MissionCaptured {
  onTaskClick?: (id: string) => void;
  onAgentClick?: (id: string) => void;
  onShowAllEvents?: () => void;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("MissionControlDashboardBridge — wire", () => {
  it("forwards onTaskClick to the host callback", async () => {
    mockFetchOk();
    const onTaskClick = vi.fn();
    render(
      <MissionControlDashboardBridge
        projectName="proj"
        onTaskClick={onTaskClick}
      />,
    );
    const opts = await waitForCapture<MissionCaptured>("MissionControlDashboard");
    opts.onTaskClick!("t-1");
    expect(onTaskClick).toHaveBeenCalledWith("t-1");
  });

  it("forwards onAgentClick to the host callback", async () => {
    mockFetchOk();
    const onAgentClick = vi.fn();
    render(
      <MissionControlDashboardBridge
        projectName="proj"
        onAgentClick={onAgentClick}
      />,
    );
    const opts = await waitForCapture<MissionCaptured>("MissionControlDashboard");
    opts.onAgentClick!("pane-2");
    expect(onAgentClick).toHaveBeenCalledWith("pane-2");
  });

  it("forwards onShowAllEvents to the host callback", async () => {
    mockFetchOk();
    const onShowAllEvents = vi.fn();
    render(
      <MissionControlDashboardBridge
        projectName="proj"
        onShowAllEvents={onShowAllEvents}
      />,
    );
    const opts = await waitForCapture<MissionCaptured>("MissionControlDashboard");
    opts.onShowAllEvents!();
    expect(onShowAllEvents).toHaveBeenCalledTimes(1);
  });
});
