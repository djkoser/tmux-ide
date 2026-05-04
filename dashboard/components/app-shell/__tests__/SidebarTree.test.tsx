import { fireEvent, render, screen } from "@testing-library/react";
import { Folder, Send } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar, SidebarContent, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarTree } from "../SidebarTree";
import type { SidebarItem } from "../sidebar-types";

function renderTree(items: SidebarItem[]) {
  return render(
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarTree items={items} />
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>,
  );
}

describe("SidebarTree", () => {
  it("renders a section with link items, badges, subtitles, and testIds", () => {
    const items: SidebarItem[] = [
      {
        id: "section-sessions",
        type: "section",
        label: "sessions",
        icon: Folder,
        items: [
          {
            id: "alpha",
            title: "alpha",
            href: "/project/alpha",
            icon: Folder,
            badge: "3/5",
            subtitle: "Mission alpha",
            testId: "sidebar-session-alpha",
          },
          {
            id: "beta",
            title: "beta",
            href: "/project/beta",
            icon: Folder,
            testId: "sidebar-session-beta",
          },
        ],
      },
    ];

    renderTree(items);

    expect(screen.getByTestId("sidebar-session-alpha")).toBeTruthy();
    expect(screen.getByTestId("sidebar-session-beta")).toBeTruthy();
    expect(screen.getByText("3/5")).toBeTruthy();
    expect(screen.getByText("Mission alpha")).toBeTruthy();
    expect(screen.getAllByText("sessions").length).toBeGreaterThan(0);
  });

  it("renders empty state when section has no items", () => {
    const items: SidebarItem[] = [
      {
        id: "section-skills",
        type: "section",
        label: "skills",
        items: [],
        emptyState: <div data-testid="empty">no skills</div>,
      },
    ];

    renderTree(items);
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("renders loading state when section is loading", () => {
    const items: SidebarItem[] = [
      {
        id: "section-loading",
        type: "section",
        label: "loading",
        items: [],
        loading: true,
        loadingState: <div data-testid="loading">loading...</div>,
      },
    ];

    renderTree(items);
    expect(screen.getByTestId("loading")).toBeTruthy();
  });

  it("fires button onClick for non-href items", () => {
    const handler = vi.fn();
    const items: SidebarItem[] = [
      {
        id: "section",
        type: "section",
        label: "settings",
        items: [
          {
            id: "settings",
            title: "Settings",
            icon: Folder,
            testId: "sidebar-settings",
            onClick: handler,
          },
        ],
      },
    ];

    renderTree(items);
    fireEvent.click(screen.getByTestId("sidebar-settings"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders an action button alongside the link", () => {
    const onAction = vi.fn();
    const items: SidebarItem[] = [
      {
        id: "section",
        type: "section",
        label: "skills",
        items: [
          {
            id: "skill-foo",
            title: "foo",
            icon: Folder,
            testId: "sidebar-skill-foo",
            onClick: () => {},
            action: {
              icon: Send,
              label: "Send foo",
              onClick: onAction,
              testId: "sidebar-skill-inject-foo",
            },
          },
        ],
      },
    ];

    renderTree(items);
    fireEvent.click(screen.getByTestId("sidebar-skill-inject-foo"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
