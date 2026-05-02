"use client";

import { usePathname } from "next/navigation";
import type { ProjectDetail } from "@/lib/types";

interface StatusBarProps {
  project: ProjectDetail;
  lastUpdate?: number;
  stale?: boolean;
}

function projectFromPath(pathname: string): string {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : "overview";
}

export function ShellStatusBar() {
  const pathname = usePathname();
  const project = projectFromPath(pathname);
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  return (
    <footer
      data-testid="status-bar"
      className="flex h-6 shrink-0 items-center border-t border-[var(--border-weak)] bg-[var(--bg-weak)] px-3 text-[11px] tabular-nums text-[var(--dim)]"
    >
      <span className="text-[var(--accent)]">{project}</span>
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
