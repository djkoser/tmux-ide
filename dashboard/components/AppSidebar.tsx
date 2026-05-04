"use client";

import {
  Folder,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useLayoutState } from "@/lib/useLayoutState";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * Mode picker that lives in the leftmost column. Only the global modes
 * (Sessions, Skills, Settings) live here — contextual lists belong in the
 * navigator column. Keeps a slim icon profile by default; the underlying
 * Base UI sidebar primitive expands the labels in the mobile drawer.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile, isMobile } = useSidebar();
  const {
    activitySection,
    activeWorkspaceTabId,
    workspaceTabs,
    openWorkspaceTab,
    setActivitySection,
  } = useLayoutState();

  const onOverview = pathname === "/" || pathname === "";
  const activeWorkspaceTab = workspaceTabs.find((tab) => tab.id === activeWorkspaceTabId);
  const settingsActive = activeWorkspaceTab?.kind === "settings";

  const closeMobile = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  return (
    <Sidebar
      data-testid="app-sidebar"
      collapsible="icon"
      // Slightly wider than the default 3rem icon width so there's breathing
      // room around the lucide glyphs at 56px (≈ craft-agents' icon column).
      style={{ "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link
                  href="/"
                  onClick={() => {
                    setActivitySection("sessions");
                    closeMobile();
                  }}
                />
              }
              isActive={onOverview}
              tooltip="Overview"
              data-testid="sidebar-overview"
            >
              <LayoutDashboard aria-hidden="true" />
              <span>Overview</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="px-1 py-1">
          <ModeButton
            id="sessions"
            label="Sessions"
            icon={Folder}
            tooltip="Sessions"
            active={activitySection === "sessions" && !settingsActive}
            onClick={() => {
              setActivitySection("sessions");
              closeMobile();
            }}
            testId="sidebar-mode-sessions"
          />
          <ModeButton
            id="skills"
            label="Skills"
            icon={Sparkles}
            tooltip="Skills"
            active={activitySection === "skills"}
            onClick={() => {
              setActivitySection("skills");
              closeMobile();
            }}
            testId="sidebar-mode-skills"
          />
          <ModeButton
            id="settings"
            label="Settings"
            icon={Settings}
            tooltip="Settings"
            active={settingsActive || activitySection === "settings"}
            onClick={() => {
              openWorkspaceTab("settings", null, "Settings");
              setActivitySection("settings");
              router.push("/");
              closeMobile();
            }}
            testId="sidebar-mode-settings"
          />
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <div className="min-w-0 px-2 text-[10px] text-[var(--dim)] group-data-[collapsible=icon]:hidden">
          <div className="truncate">theme follows system</div>
          <div className="mt-0.5 truncate tabular-nums">
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

interface ModeButtonProps {
  id: string;
  label: string;
  icon: LucideIcon;
  tooltip: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}

function ModeButton({ label, icon: Icon, tooltip, active, onClick, testId }: ModeButtonProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={active}
        tooltip={tooltip}
        onClick={onClick}
        data-testid={testId}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
