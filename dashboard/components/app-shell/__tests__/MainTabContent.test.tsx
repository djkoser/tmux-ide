import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainTabContent } from "../MainTabContent";
import {
  __resetNavigationForTests,
  openTab,
  setActiveSession,
  setNavigation,
  skillTab,
  viewTab,
} from "@/lib/navigation";
import { __resetLayoutStateForTests } from "@/lib/useLayoutState";

vi.mock("@/lib/api", () => ({
  fetchPlans: vi.fn(async () => []),
  fetchPlan: vi.fn(async () => null),
  fetchSessions: vi.fn(async () => []),
  fetchSkills: vi.fn(async () => []),
  fetchSkill: vi.fn(async () => null),
  fetchValidation: vi.fn(async () => null),
  fetchCoverage: vi.fn(async () => null),
  fetchMetrics: vi.fn(async () => null),
  fetchProject: vi.fn(async () => ({ tasks: [], goals: [], agents: [], session: "alpha" })),
  fetchMission: vi.fn(async () => null),
  fetchEvents: vi.fn(async () => []),
  injectIntoProject: vi.fn(async () => true),
}));

vi.mock("@/lib/useSessionStream", () => ({
  useSessionStream: () => ({
    snapshot: null,
    lastEventAt: 0,
    connected: false,
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  __resetLayoutStateForTests();
  __resetNavigationForTests({ type: "overview" });
});

afterEach(() => {
  __resetNavigationForTests({ type: "overview" });
});

describe("MainTabContent", () => {
  it("renders the empty state when no tabs are open", () => {
    render(<MainTabContent />);
    expect(screen.getByTestId("main-tab-empty")).toBeTruthy();
  });

  it("renders the active view tab", () => {
    setActiveSession("alpha");
    render(<MainTabContent />);
    const panel = screen.getByTestId("main-tab-panel");
    expect(panel.getAttribute("data-tab-kind")).toBe("view");
    expect(panel.getAttribute("data-tab-id")).toBe("view:alpha:kanban");
  });

  it("renders a skill view when active tab is a skill", () => {
    setActiveSession("alpha");
    openTab(skillTab("alpha", "frontend"));
    render(<MainTabContent />);
    const panel = screen.getByTestId("main-tab-panel");
    expect(panel.getAttribute("data-tab-kind")).toBe("skill");
  });

  it("renders the settings view when active tab is settings", () => {
    setNavigation({ type: "settings" });
    render(<MainTabContent />);
    const panel = screen.getByTestId("main-tab-panel");
    expect(panel.getAttribute("data-tab-kind")).toBe("settings");
  });

  it("switches the rendered panel when activating a different view", () => {
    setActiveSession("alpha");
    openTab(viewTab("alpha", "plans"));
    render(<MainTabContent />);
    const panel = screen.getByTestId("main-tab-panel");
    expect(panel.getAttribute("data-tab-id")).toBe("view:alpha:plans");
  });
});
