/**
 * V2ChatView render smoke. After U3 retired chat v1, the only render
 * path is ChatV2Root — the cutover-overrides this test used to exercise
 * (chatVersionOverride="v1"/"v2", URL ?chat=v1, deprecation banner) are
 * gone. We keep the data-testid + data-version assertions so a future
 * accidental regression that swaps the wrapper id surfaces here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { V2ChatView } from "@/app/v2/_lib/V2ChatView";

// Stub the network layer so the component renders without hitting the API.
vi.mock("@/lib/api", () => ({
  chatThreadList: vi.fn(async () => ({ threads: [] })),
  chatProvidersList: vi.fn(async () => ({ providers: [] })),
  chatThreadCreate: vi.fn(async () => ({
    thread: { id: "t-1", title: "x", providerKind: "claude-code", messageCount: 0 },
  })),
  chatThreadDelete: vi.fn(async () => ({})),
  fetchProjectFiles: vi.fn(async () => []),
}));

// Stub the WebSocket bus so subscribeSession is a no-op.
vi.mock("@/lib/wsBus", () => ({
  subscribeSession: vi.fn(() => () => undefined),
}));

// Stub useSessionStream so V2ChatView's snapshot read for agents/skills
// resolves to an empty snapshot during the shell-only assertions.
vi.mock("@/lib/useSessionStream", () => ({
  useSessionStream: () => ({ snapshot: null }),
}));

// Stub ChatV2Root so we don't exercise the useChatStore-derived state
// machine (which uses useSyncExternalStore and in JSDOM loops on
// getSnapshot when fed empty inputs). We're testing the wrapper shell,
// not the child tree.
vi.mock("@/components/chat-v2", () => ({
  ChatV2Root: () => null,
}));

afterEach(() => {
  cleanup();
});

describe("V2ChatView shell (post-U3)", () => {
  it("renders the v2 container", () => {
    render(<V2ChatView projectName="demo" />);
    expect(screen.getByTestId("v2-chat-view-chat-v2")).toBeTruthy();
  });

  it("carries data-chat-version='v2'", () => {
    render(<V2ChatView projectName="demo" />);
    expect(screen.getByTestId("v2-chat-view-chat-v2").getAttribute("data-chat-version")).toBe("v2");
  });

  it("never renders a chat-v1 banner (v1 retired in U3)", () => {
    render(<V2ChatView projectName="demo" />);
    expect(screen.queryByTestId("chat-v1-deprecation-banner")).toBeNull();
  });
});
