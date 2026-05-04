"use client";

import { useCallback, type ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette, openCommandPalette } from "@/components/CommandPalette";
import { EventBridge } from "@/components/EventBridge";
import { FullScreenTerminal } from "@/components/FullScreenTerminal";
import { KeybindRoot } from "@/components/KeybindRoot";
import { ShellStatusBar } from "@/components/StatusBar";
import { ToastStack } from "@/components/ToastStack";
import { WorkspaceUrlSync } from "@/components/WorkspaceUrlSync";
import { MainTabContent } from "./MainTabContent";
import { MainTabsBar } from "./MainTabsBar";
import { SidebarInset } from "@/components/ui/sidebar";
import { activateTab, closeTab, useNavigation } from "@/lib/navigation";
import { useKeybind } from "@/lib/useKeybinds";

/**
 * AppShell — Phase Z layout.
 *
 *   TopBar (Agent 1: project switcher + global controls)
 *   AppSidebar (Agent 2: contextual tree)  ┃  MainTabsBar
 *                                          ┃  MainTabContent
 *
 * Single source of truth for layout: NavigationState
 * (`{ sessionName, openTabs, activeTabId }`). The mode/type union is
 * gone — modes are derived from the active tab's kind.
 *
 * The previous five-surface choreography (WorkspaceTabsBar +
 * ProjectViewTabs + WorkspaceTabsManager + NavigatorSlot +
 * SecondaryTabsSlot) collapses into MainTabsBar + MainTabContent.
 */
const SHELL_CLASS = "flex h-[calc(100vh-1.5rem)] min-h-0 flex-col";

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className={SHELL_CLASS}>
      <WorkspaceUrlSync />
      <EventBridge />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <SidebarInset>
          <MainTabsBar />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {/* `children` is the Next.js route tree. Phase Z routes
                render null because MainTabContent owns view selection;
                kept in the tree so SSR + client hydration stay in
                lockstep on first paint. */}
            <MainTabContent />
            {children}
            <FullScreenTerminal />
          </div>
        </SidebarInset>
      </div>
      <ShellStatusBar />
      <CommandPalette />
      <ToastStack />
      <KeybindRoot />
      <TabKeybinds />
    </div>
  );
}

/**
 * Shell-scoped keybinds for the unified tab strip:
 *   - Cmd+T: open the command palette (acts as the "new tab" picker)
 *   - Cmd+W: close the active main tab
 *   - Cmd+1..Cmd+9: jump to tab N (1-indexed)
 */
function TabKeybinds() {
  const { openTabs, activeTabId } = useNavigation();

  const newTab = useCallback(() => {
    openCommandPalette();
  }, []);

  const closeActive = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId]);

  const jumpTo = useCallback(
    (index: number) => {
      const tab = openTabs[index];
      if (tab) activateTab(tab.id);
    },
    [openTabs],
  );

  useKeybind("Mod+t", newTab);
  useKeybind("Mod+w", closeActive);
  useKeybind("Mod+1", () => jumpTo(0));
  useKeybind("Mod+2", () => jumpTo(1));
  useKeybind("Mod+3", () => jumpTo(2));
  useKeybind("Mod+4", () => jumpTo(3));
  useKeybind("Mod+5", () => jumpTo(4));
  useKeybind("Mod+6", () => jumpTo(5));
  useKeybind("Mod+7", () => jumpTo(6));
  useKeybind("Mod+8", () => jumpTo(7));
  useKeybind("Mod+9", () => jumpTo(8));

  return null;
}
