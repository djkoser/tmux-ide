"use client";

import { useEffect } from "react";
import { openAddProjectDialog } from "@/lib/addProjectDialogStore";
import { openTab, settingsTab } from "@/lib/navigation";

export type MenuBridgeChannel = "menu:add-project" | "menu:open-settings";

let firstRunProjectPromptShown = false;

export function useMenuBridge(): void {
  useEffect(() => {
    const runtime = window.__TMUX_IDE__;
    if (!runtime?.on) return;

    const disposeAddProject = runtime.on("menu:add-project", () => openAddProjectDialog());
    const disposeSettings = runtime.on("menu:open-settings", () => {
      openTab(settingsTab("general", "Settings"));
    });

    return () => {
      disposeAddProject();
      disposeSettings();
    };
  }, []);
}

export function useFirstRunProjectPrompt({
  loading,
  projectCount,
  openDialog = openAddProjectDialog,
}: {
  loading: boolean;
  projectCount: number;
  openDialog?: () => void;
}): void {
  useEffect(() => {
    if (firstRunProjectPromptShown || loading || projectCount !== 0) return;
    firstRunProjectPromptShown = true;
    openDialog();
  }, [loading, openDialog, projectCount]);
}

export function __resetMenuBridgeForTests(): void {
  firstRunProjectPromptShown = false;
}
