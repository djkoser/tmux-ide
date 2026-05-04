"use client";

import type { ReactNode } from "react";
import { PanelHeader } from "@/components/ui";

interface NavigatorShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/**
 * Shared chrome for navigator panels: a fixed header (title + actions) and
 * a scrollable body. Lives inside the always-visible navigator slot, so the
 * shell already owns the column width — this just gives each navigator a
 * consistent skeleton.
 */
export function NavigatorShell({
  title,
  subtitle,
  actions,
  badge,
  children,
  testId,
}: NavigatorShellProps) {
  return (
    <div
      data-testid={testId}
      className="flex h-full min-h-0 w-full flex-col bg-[var(--bg-weak)]"
    >
      <PanelHeader title={title} subtitle={subtitle} actions={actions} badge={badge} />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
