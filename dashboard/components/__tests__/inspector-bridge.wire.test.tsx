/**
 * Wire-coverage for InspectorBridge (T1).
 *
 * The bridge forwards `onToggleExpanded` to the host, fetches the
 * initial events list, and subscribes to the WS bus for streamed
 * appends. Wire tests: callback forward + initial fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";

vi.mock("@/lib/wsBus", () => ({
  subscribeSession: () => () => undefined,
}));

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

import { InspectorBridge } from "@/components/inspector-bridge";

interface InspectorCaptured {
  onToggleExpanded?: (next: boolean) => void;
  hideHeartbeats?: boolean;
  currentView?: string;
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("InspectorBridge — wire", () => {
  it("mount fetches /api/project/:name/events", async () => {
    const fetchMock = mockFetchOk({ json: { events: [] } });
    render(<InspectorBridge projectName="proj" />);
    await waitForCapture<InspectorCaptured>("Inspector");

    const eventsCall = fetchMock.mock.calls.find(([url]) =>
      typeof url === "string" && url.includes("/api/project/proj/events"),
    );
    expect(eventsCall).toBeDefined();
  });

  it("forwards onToggleExpanded(true) to the host callback", async () => {
    mockFetchOk({ json: { events: [] } });
    const onToggleExpanded = vi.fn();
    render(
      <InspectorBridge
        projectName="proj"
        expanded={false}
        onToggleExpanded={onToggleExpanded}
      />,
    );
    const opts = await waitForCapture<InspectorCaptured>("Inspector");
    opts.onToggleExpanded!(true);
    expect(onToggleExpanded).toHaveBeenCalledWith(true);
  });

  it("propagates hideHeartbeats default (true) into the mount options", async () => {
    mockFetchOk({ json: { events: [] } });
    render(<InspectorBridge projectName="proj" />);
    const opts = await waitForCapture<InspectorCaptured>("Inspector");
    expect(opts.hideHeartbeats).toBe(true);
  });
});
