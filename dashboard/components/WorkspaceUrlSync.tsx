"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLayoutState } from "@/lib/useLayoutState";

function projectFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function WorkspaceUrlSync() {
  const pathname = usePathname();
  const { openWorkspaceTab, setActivitySection } = useLayoutState();

  useEffect(() => {
    const projectName = projectFromPath(pathname);
    if (!projectName) return;
    openWorkspaceTab("project", projectName, projectName);
    setActivitySection("sessions");
  }, [openWorkspaceTab, pathname, setActivitySection]);

  return null;
}
