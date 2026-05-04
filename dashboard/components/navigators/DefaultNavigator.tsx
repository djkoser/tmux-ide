"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLayoutState } from "@/lib/useLayoutState";
import { MissionTreeNavigator } from "./MissionTreeNavigator";
import { SessionsNavigator } from "./SessionsNavigator";
import { SkillsNavigator } from "./SkillsNavigator";

/**
 * Picks the right navigator based on global mode + current route. Used as
 * the fallback when no view registers a navigator via NavigatorPortal.
 *
 * Priorities (most specific first):
 *  1. mode = "skills"   → SkillsNavigator
 *  2. mode = "settings" → null (SettingsView portals its own navigator)
 *  3. /project/X with no `tab` query param (kanban) → MissionTreeNavigator
 *  4. fallback                                       → SessionsNavigator
 */
export function DefaultNavigator() {
  const pathname = usePathname();
  const { activitySection } = useLayoutState();
  const tab = useUrlTab();

  if (activitySection === "skills") {
    return <SkillsNavigator />;
  }

  if (activitySection === "settings") {
    return null;
  }

  const projectMatch = /^\/project\/([^/]+)/.exec(pathname);
  if (projectMatch && (!tab || tab === "kanban" || tab === "mission")) {
    const sessionName = decodeURIComponent(projectMatch[1]!);
    return <MissionTreeNavigator sessionName={sessionName} />;
  }

  return <SessionsNavigator />;
}

/**
 * Subscribes to `?tab=` so DefaultNavigator re-renders on tab switches
 * without having to thread the active tab through context. Pairs with
 * the `replaceState` + popstate pattern used by ProjectPage.
 */
function useUrlTab(): string | null {
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    function read() {
      if (typeof window === "undefined") return;
      const value = new URLSearchParams(window.location.search).get("tab");
      setTab(value);
    }
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  return tab;
}
