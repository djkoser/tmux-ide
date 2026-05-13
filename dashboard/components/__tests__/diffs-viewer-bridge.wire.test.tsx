/**
 * Wire-coverage for DiffsViewerBridge (T1).
 *
 * The bridge has no buttons of its own — its sole "wire" is the host
 * config it forwards (sessionName, apiBaseUrl, bearerToken). The
 * widget owns all daemon calls past that. Test asserts the bridge
 * shipped those values into the mount options.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";

vi.mock("@/lib/appProtocol", () => ({
  resolveApiBase: () => "http://daemon.test:6060",
  resolveAuthToken: () => "test-bearer-token",
}));

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockMounts();
});

import { DiffsViewerBridge } from "@/components/diffs-viewer-bridge";

interface DiffsCaptured {
  sessionName?: string;
  apiBaseUrl?: string;
  bearerToken?: string | null;
  initialDiffStyle?: "unified" | "split";
}

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("DiffsViewerBridge — wire", () => {
  it("forwards sessionName + apiBaseUrl + bearerToken to the widget mount", async () => {
    mockFetchOk();
    render(<DiffsViewerBridge sessionName="proj" initialDiffStyle="split" />);
    const opts = await waitForCapture<DiffsCaptured>("DiffsViewer");
    expect(opts.sessionName).toBe("proj");
    expect(opts.apiBaseUrl).toBe("http://daemon.test:6060");
    expect(opts.bearerToken).toBe("test-bearer-token");
    expect(opts.initialDiffStyle).toBe("split");
  });
});
