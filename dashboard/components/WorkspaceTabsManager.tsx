"use client";

import type { ReactNode } from "react";
import { Folder } from "lucide-react";
import { usePathname } from "next/navigation";
import { NotificationsView } from "@/components/views/NotificationsView";
import { SettingsView } from "@/components/views/SettingsView";
import { SkillView } from "@/components/views/SkillView";
import { useLayoutState, type WorkspaceTab } from "@/lib/useLayoutState";

function hrefForWorkspaceTab(tab: WorkspaceTab): string {
  if (
    tab.kind === "settings" ||
    tab.kind === "notifications" ||
    tab.kind === "skill" ||
    !tab.projectName
  )
    return "/";
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
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--dim)]">
        <Folder aria-hidden="true" size={28} strokeWidth={1.5} />
        <span>select a session from the sidebar</span>
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
            className={`absolute inset-0 min-h-0 ${
              active ? "motion-safe:animate-[workspace-panel-fade_150ms_ease-out]" : ""
            }`}
            style={{ display: active ? "flex" : "none" }}
          >
            {tab.kind === "notifications" ? (
              <NotificationsView />
            ) : tab.kind === "settings" ? (
              <SettingsView />
            ) : tab.kind === "skill" && tab.projectName && tab.ref ? (
              <SkillView sessionName={tab.projectName} skillName={tab.ref} />
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
