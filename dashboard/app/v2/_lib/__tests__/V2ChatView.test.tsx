 
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { V2ChatView } from "@/app/v2/_lib/V2ChatView";
import { CHAT_V1_BANNER_TEXT } from "@/lib/chatVersion";

// Stub the network layer so the component renders without hitting the API.
vi.mock("@/lib/api", () => ({
  chatThreadList: vi.fn(async () => ({ threads: [] })),
  chatProvidersList: vi.fn(async () => ({ providers: [] })),
  chatThreadCreate: vi.fn(async () => ({
    thread: { id: "t-1", title: "x", providerKind: "claude-code", messageCount: 0 },
  })),
  chatThreadDelete: vi.fn(async () => ({})),
}));

// Stub the WebSocket bus so subscribeSession is a no-op.
vi.mock("@/lib/wsBus", () => ({
  subscribeSession: vi.fn(() => () => undefined),
}));

// Stub appProtocol resolvers used by the SolidChatIsland (which never mounts
// in JSDOM but the import path runs during module evaluation).
vi.mock("@/lib/appProtocol", () => ({
  resolveApiBase: () => "http://localhost",
  resolveAuthToken: () => null,
  withWsBase: (path: string) => `ws://localhost${path}`,
}));

// The SolidChatIsland dynamically imports @tmux-ide/chat-solid; Vite needs
// the module to resolve even though happy-dom never executes the mount.
vi.mock("@tmux-ide/chat-solid", () => ({
  mount: () => ({ unmount: () => undefined, setThreadId: () => undefined }),
}));

// Stub ChatV2Root so the v2 branch renders without exercising the
// useChatStore-derived state machine (which uses useSyncExternalStore and
// in JSDOM with empty inputs loops on getSnapshot). We're testing the
// route-selection logic, not the child tree.
vi.mock("@/components/chat-v2", () => ({
  ChatV2Root: () => null,
}));

afterEach(() => {
  cleanup();
});

describe("V2ChatView :: feature-flag-cutover (T080)", () => {
  it("default override → renders new (v2) UI", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v2" />);
    expect(screen.getByTestId("v2-chat-view-chat-v2")).toBeTruthy();
    expect(screen.queryByTestId("chat-v1-deprecation-banner")).toBeNull();
  });

  it("?chat=v1 override → renders old (v1) UI with deprecation banner", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v1" />);
    expect(screen.queryByTestId("v2-chat-view-chat-v2")).toBeNull();
    const banner = screen.getByTestId("chat-v1-deprecation-banner");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toBe(CHAT_V1_BANNER_TEXT);
  });

  it("v1 banner exposes status role for assistive tech", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v1" />);
    expect(screen.getByRole("status").textContent).toBe(CHAT_V1_BANNER_TEXT);
  });

  it("v1 container carries data-chat-version='v1'", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v1" />);
    expect(
      screen.getByTestId("v2-chat-view-chat-v1").getAttribute("data-chat-version"),
    ).toBe("v1");
  });

  it("v2 container carries data-chat-version='v2'", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v2" />);
    expect(
      screen.getByTestId("v2-chat-view-chat-v2").getAttribute("data-chat-version"),
    ).toBe("v2");
  });

  it("v2 UI does NOT render the v1 banner — banner is gated on v1 only", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v2" />);
    expect(screen.queryByTestId("chat-v1-deprecation-banner")).toBeNull();
  });

  it("v1 UI renders the legacy ThreadRail (escape hatch keeps thread list visible)", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v1" />);
    // ThreadRail prints the placeholder when no threads are loaded.
    expect(screen.getByText("— no threads —")).toBeTruthy();
  });

  it("v1 banner copy contains the issues link target", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v1" />);
    expect(screen.getByTestId("chat-v1-deprecation-banner").textContent).toContain(
      "github.com/wavyrai/tmux-ide/issues",
    );
  });

  it("v1 banner copy mentions removal in the next release", () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v1" />);
    expect(screen.getByTestId("chat-v1-deprecation-banner").textContent).toMatch(
      /removed in the next release/,
    );
  });

  it("auto-detect (no override, no URL) lands on v2 — the new default", () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search: "" },
    });
    try {
      window.localStorage.clear();
      render(<V2ChatView projectName="demo" />);
      expect(screen.getByTestId("v2-chat-view-chat-v2")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("auto-detect with ?chat=v1 in URL lands on v1 + banner", () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search: "?chat=v1" },
    });
    try {
      window.localStorage.clear();
      render(<V2ChatView projectName="demo" />);
      expect(screen.getByTestId("chat-v1-deprecation-banner")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
