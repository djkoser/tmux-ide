"use client";

import { useLayoutState } from "@/lib/useLayoutState";

export function ActivityBar() {
  const { activitySection, openWorkspaceTab, setActivitySection } = useLayoutState();

  return (
    <nav className="flex w-12 shrink-0 flex-col border-r border-[var(--border-weak)] bg-[var(--bg-strong)] py-2">
      <button
        type="button"
        data-testid="activity-section-sessions"
        data-active={activitySection === "sessions" ? "true" : "false"}
        onClick={() => setActivitySection("sessions")}
        className={`flex h-10 items-center justify-center text-[17px] transition-colors ${
          activitySection === "sessions"
            ? "text-[var(--accent)]"
            : "text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        }`}
        aria-label="Sessions"
      >
        ▦
      </button>

      <button
        type="button"
        data-testid="activity-section-skills"
        data-active={activitySection === "skills" ? "true" : "false"}
        onClick={() => setActivitySection("skills")}
        className={`flex h-10 items-center justify-center text-[15px] transition-colors ${
          activitySection === "skills"
            ? "text-[var(--accent)]"
            : "text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        }`}
        aria-label="Skills"
      >
        S
      </button>

      <button
        type="button"
        data-testid="activity-section-settings"
        data-active={activitySection === "settings" ? "true" : "false"}
        onClick={() => {
          openWorkspaceTab("settings", null, "Settings");
          setActivitySection("settings");
        }}
        className={`flex h-10 items-center justify-center text-[16px] transition-colors ${
          activitySection === "settings"
            ? "text-[var(--accent)]"
            : "text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        }`}
        aria-label="Settings"
      >
        ⚙
      </button>
    </nav>
  );
}
