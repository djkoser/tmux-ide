"use client";

import { ActionInvocationError } from "./actionClient";

/**
 * Map a `project.openTerminal` action failure onto a user-facing toast
 * payload. Branches on `error.code` (never on the message) so that
 * contract changes never silently demote the toast to the generic
 * fallback.
 *
 * Lives outside `AppSidebar` and `useLayoutState` so both modules can
 * import it without forming a circular dependency. Pure data — callers
 * forward the result to `useToasts().push(...)` or `pushToastImperative`.
 */
export function toastForOpenTerminalError(
  projectName: string,
  err: unknown,
): { kind: "error"; title: string; body: string } {
  if (err instanceof ActionInvocationError) {
    switch (err.code) {
      case "project_not_found":
        return {
          kind: "error",
          title: "Project not registered",
          body: `"${projectName}" isn't in the project registry.`,
        };
      case "cwd_not_found":
      case "cwd_not_directory":
      case "cwd_stat_failed":
        return {
          kind: "error",
          title: "Project directory unavailable",
          body: `Working directory for "${projectName}" can't be opened.`,
        };
      case "launch_failed":
        return {
          kind: "error",
          title: "Couldn't launch session",
          body: err.message,
        };
      default:
        return {
          kind: "error",
          title: "Couldn't open terminal",
          body: err.message,
        };
    }
  }
  return {
    kind: "error",
    title: "Couldn't open terminal",
    body: err instanceof Error ? err.message : `Couldn't open terminal for "${projectName}".`,
  };
}
