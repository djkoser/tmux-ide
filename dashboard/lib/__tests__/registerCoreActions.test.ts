import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAction, __clearActionsForTests } from "../actions";
import { registerCoreActions } from "../registerCoreActions";
import { __resetNavigationForTests, getNavigationStateLive, setActiveSession } from "../navigation";
import { chatThreadCreate, fetchProject } from "@/lib/api";
import {
  __resetNewChatPickerStoreForTests,
  getNewChatPickerStateForTests,
} from "@/lib/newChatPickerStore";

vi.mock("@/components/CommandPalette", () => ({
  openCommandPalette: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchProject: vi.fn(async () => ({
    session: "alpha",
    dir: "/repos/alpha",
    mission: null,
    goals: [],
    tasks: [],
    agents: [],
  })),
  chatThreadCreate: vi.fn(async () => ({
    thread: {
      id: "thread-1",
      title: "Project chat",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      providerKind: "claude-code",
      projectDir: "/repos/alpha",
      messageCount: 0,
    },
  })),
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  __clearActionsForTests();
  __resetNavigationForTests({ type: "overview" });
  __resetNewChatPickerStoreForTests();
});

afterEach(() => {
  __clearActionsForTests();
  __resetNavigationForTests({ type: "overview" });
  __resetNewChatPickerStoreForTests();
});

describe("registerCoreActions", () => {
  it("opens the new-chat picker instead of creating a thread directly", async () => {
    setActiveSession("alpha");
    const cleanup = registerCoreActions({
      currentProject: "alpha",
      layout: {
        toggleTerminal: vi.fn(),
        setActivitySection: vi.fn(),
        openWorkspaceTab: vi.fn(),
      },
      toggleSidebar: vi.fn(),
      toggleTheme: vi.fn(),
    });

    runAction("new-chat-tab");

    await waitFor(() => {
      expect(getNewChatPickerStateForTests()).toEqual({
        open: true,
        defaultSessionName: "alpha",
      });
    });

    expect(fetchProject).not.toHaveBeenCalled();
    expect(chatThreadCreate).not.toHaveBeenCalled();
    const live = getNavigationStateLive();
    expect(live.openTabs.some((tab) => tab.kind === "chat")).toBe(false);

    cleanup();
  });
});
