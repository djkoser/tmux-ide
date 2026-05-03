"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NotificationsView } from "@/components/views/NotificationsView";
import { useLayoutState, type WorkspaceTab } from "@/lib/useLayoutState";

function hrefForWorkspaceTab(tab: WorkspaceTab): string {
  if (tab.kind === "settings" || tab.kind === "notifications" || !tab.projectName) return "/";
  return `/project/${encodeURIComponent(tab.projectName)}`;
}

interface WorkspaceTabsManagerProps {
  children?: ReactNode;
}

export function WorkspaceTabsManager({ children }: WorkspaceTabsManagerProps) {
  const pathname = usePathname();
  const { workspaceTabs, activeWorkspaceTabId } = useLayoutState();

  if (workspaceTabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--dim)]">
        select a session from the sidebar
      </div>
    );
  }

  return (
    <>
      {workspaceTabs.map((tab) => {
        const active = tab.id === activeWorkspaceTabId;
        const routeMatches = tab.kind === "project" && pathname === hrefForWorkspaceTab(tab);

        return (
          <section
            key={tab.id}
            data-testid="workspace-tab-panel"
            data-active={active ? "true" : "false"}
            className="absolute inset-0 min-h-0"
            style={{ display: active ? "flex" : "none" }}
          >
            {tab.kind === "notifications" ? (
              <NotificationsView />
            ) : tab.kind === "settings" ? (
              <div className="flex h-full flex-1 flex-col">
                <div className="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-4 text-[var(--accent)]">
                  Settings
                </div>
                <div className="flex-1 p-4 text-[var(--dim)]">settings workspace</div>
              </div>
            ) : routeMatches ? (
              children
            ) : (
              <div className="flex h-full flex-1 items-center justify-center text-[var(--dim)]">
                {tab.title}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
