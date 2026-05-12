import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThreadListRail } from "../ThreadListRail";
import type { ThreadIndexEntry } from "@/components/chat/types";

const NOW = Date.parse("2026-05-11T12:00:00Z");

function thread(overrides: Partial<ThreadIndexEntry> = {}): ThreadIndexEntry {
  return {
    id: "thr_a",
    title: "Alpha",
    createdAt: "2026-05-11T10:00:00Z",
    updatedAt: "2026-05-11T11:30:00Z",
    providerKind: "claude-code",
    messageCount: 0,
    ...overrides,
  };
}

describe("ThreadListRail", () => {
  beforeAllOnce();

  it("renders an empty state when there are no threads", () => {
    render(
      <ThreadListRail
        threads={[]}
        activeId={null}
        unreadByThread={{}}
        onPick={() => {}}
        onNew={() => {}}
      />,
    );
    expect(screen.getByTestId("thread-list-empty")).toBeTruthy();
  });

  it("renders one item per thread with provider chip and title", () => {
    render(
      <ThreadListRail
        threads={[thread({ id: "t1", title: "One" }), thread({ id: "t2", title: "Two" })]}
        activeId={null}
        unreadByThread={{}}
        onPick={() => {}}
        onNew={() => {}}
      />,
    );
    const items = screen.getAllByTestId("thread-list-item");
    expect(items).toHaveLength(2);
    expect(screen.getAllByTestId("thread-provider-chip")[0]?.textContent).toBe(
      "claude-code",
    );
  });

  it("calls onPick(id) when an item is clicked", () => {
    const onPick = vi.fn();
    render(
      <ThreadListRail
        threads={[thread({ id: "thr_x" })]}
        activeId={null}
        unreadByThread={{}}
        onPick={onPick}
        onNew={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("thread-list-item").querySelector("button")!);
    expect(onPick).toHaveBeenCalledWith("thr_x");
  });

  it("calls onNew when the + new button is clicked", () => {
    const onNew = vi.fn();
    render(
      <ThreadListRail
        threads={[]}
        activeId={null}
        unreadByThread={{}}
        onPick={() => {}}
        onNew={onNew}
      />,
    );
    fireEvent.click(screen.getByTestId("thread-list-new"));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("marks the active thread with data-active='true' and aria-selected", () => {
    render(
      <ThreadListRail
        threads={[thread({ id: "t1" }), thread({ id: "t2" })]}
        activeId="t2"
        unreadByThread={{}}
        onPick={() => {}}
        onNew={() => {}}
      />,
    );
    const t2 = screen.getAllByTestId("thread-list-item").find(
      (el) => el.getAttribute("data-thread-id") === "t2",
    );
    expect(t2?.getAttribute("data-active")).toBe("true");
    expect(t2?.getAttribute("aria-selected")).toBe("true");
  });

  it("shows the unread dot when the thread is not active and has unread > 0", () => {
    render(
      <ThreadListRail
        threads={[thread({ id: "t1" })]}
        activeId={null}
        unreadByThread={{ t1: 3 }}
        onPick={() => {}}
        onNew={() => {}}
      />,
    );
    const dot = screen.getByTestId("thread-unread-dot");
    expect(dot.getAttribute("aria-label")).toBe("3 unread");
  });

  it("hides the unread dot when the thread is active even if unread > 0", () => {
    render(
      <ThreadListRail
        threads={[thread({ id: "t1" })]}
        activeId="t1"
        unreadByThread={{ t1: 5 }}
        onPick={() => {}}
        onNew={() => {}}
      />,
    );
    expect(screen.queryByTestId("thread-unread-dot")).toBeNull();
  });
});

function beforeAllOnce(): void {
  // Stable clock for the relative-time helper. Vitest reuses module
  // state across describes so set it once.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
}
