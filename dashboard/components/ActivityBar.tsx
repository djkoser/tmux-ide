"use client";

import { Folder, Settings, Sparkles } from "lucide-react";
import { useLayoutState } from "@/lib/useLayoutState";

interface ActivityBarProps {
  className?: string;
  testId?: string;
  variant?: "inline" | "drawer";
  onNavigate?: () => void;
}

export function ActivityBar({
  className = "",
  testId = "activity-bar",
  variant = "inline",
  onNavigate,
}: ActivityBarProps) {
  const { activitySection, openWorkspaceTab, setActivitySection } = useLayoutState();
  const drawer = variant === "drawer";

  return (
    <nav
      data-testid={testId}
      className={`${drawer ? "h-12 flex-row border-b px-2" : "w-12 flex-col border-r py-2"} flex shrink-0 border-[var(--border-weak)] bg-[var(--bg-strong)] ${className}`}
    >
      <button
        type="button"
        data-testid="activity-section-sessions"
        data-active={activitySection === "sessions" ? "true" : "false"}
        onClick={() => {
          setActivitySection("sessions");
          onNavigate?.();
        }}
        className={`flex h-10 items-center justify-center text-[17px] transition-colors ${
          drawer ? "w-10" : ""
        } ${
          activitySection === "sessions"
            ? "text-[var(--accent)]"
            : "text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        }`}
        aria-label="Sessions"
      >
        <Folder aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        data-testid="activity-section-skills"
        data-active={activitySection === "skills" ? "true" : "false"}
        onClick={() => {
          setActivitySection("skills");
          onNavigate?.();
        }}
        className={`flex h-10 items-center justify-center text-[15px] transition-colors ${
          drawer ? "w-10" : ""
        } ${
          activitySection === "skills"
            ? "text-[var(--accent)]"
            : "text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        }`}
        aria-label="Skills"
      >
        <Sparkles aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        data-testid="activity-section-settings"
        data-active={activitySection === "settings" ? "true" : "false"}
        onClick={() => {
          openWorkspaceTab("settings", null, "Settings");
          setActivitySection("settings");
          onNavigate?.();
        }}
        className={`flex h-10 items-center justify-center text-[16px] transition-colors ${
          drawer ? "w-10" : ""
        } ${
          activitySection === "settings"
            ? "text-[var(--accent)]"
            : "text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        }`}
        aria-label="Settings"
      >
        <Settings aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>
    </nav>
  );
}
