"use client";

/**
 * ProjectPage — Phase Z stub.
 *
 * The shell layout's `MainTabContent` now renders the active tab
 * from NavigationState, so per-project routes no longer need to mount
 * any view tree of their own. Next.js still resolves
 * `/project/<name>` because the route file (`page.tsx`) exists for
 * static export, and the shell's URL sync seeds NavigationState from
 * the pathname on first load.
 */
export default function ProjectPage() {
  return null;
}
