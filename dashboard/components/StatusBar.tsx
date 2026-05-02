"use client";

import { usePathname } from "next/navigation";
import { AgentsSegment } from "@/components/status-bar/AgentsSegment";
import { MilestonesSegment } from "@/components/status-bar/MilestonesSegment";
import { MissionStatusSegment } from "@/components/status-bar/MissionStatusSegment";
import { projectNameFromPath } from "@/components/status-bar/projectPath";
import { SkillsSegment } from "@/components/status-bar/SkillsSegment";
import type { ProjectDetail } from "@/lib/types";

interface StatusBarProps {
  project: ProjectDetail;
  lastUpdate?: number;
  stale?: boolean;
}

function projectFromPath(pathname: string): string {
  return projectNameFromPath(pathname) ?? "overview";
}

export function ShellStatusBar() {
  const pathname = usePathname();
  const project = projectFromPath(pathname);
  const projectRoute = projectNameFromPath(pathname) !== null;
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  return (
    <footer
      data-testid="status-bar"
      className="flex h-6 shrink-0 items-center border-t border-[var(--border-weak)] bg-[var(--bg-weak)] px-3 text-[11px] tabular-nums text-[var(--dim)]"
    >
      <span className="text-[var(--accent)]">{project}</span>
      {projectRoute && (
        <>
          <MissionStatusSegment />
          <MilestonesSegment />
          <AgentsSegment />
          <SkillsSegment />
        </>
      )}
      <span className="mx-2 opacity-30">│</span>
      <span>terminal ⌘J</span>
      <span className="mx-2 opacity-30">│</span>
      <span>theme ⌘⇧T</span>
      <span className="flex-1" />
      <span>tmux-ide {version}</span>
    </footer>
  );
}

export function StatusBar(_props: StatusBarProps) {
  return null;
}
