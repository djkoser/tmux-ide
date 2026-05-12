/**
 * Handler: `project.launch`.
 *
 * Idempotent programmatic launch. Resolves the project from the registry,
 * checks whether a session is already running, and returns
 * `{ started: false }` without invoking the launcher when so. Otherwise
 * delegates to `src/launch.ts` with `attach: false`.
 */

import { hasSession as hasSessionDefault } from "@tmux-ide/tmux-bridge";
import { launch as launchDefault } from "../../../launch.ts";
import { ActionError } from "../errors.ts";
import { type ActionInput, type ActionResult } from "../contract.ts";
import { resolveProject, type ProjectResolverDeps } from "./_resolve-project.ts";

export interface ProjectLaunchDeps extends ProjectResolverDeps {
  hasSession?: (session: string) => boolean;
  launch?: (dir: string, options: { json: boolean; attach: boolean }) => Promise<void>;
}

export async function projectLaunchHandler(
  input: ActionInput<"project.launch">,
  deps: ProjectLaunchDeps = {},
): Promise<ActionResult<"project.launch">> {
  const project = resolveProject(input.name, deps);
  const hasSession = deps.hasSession ?? hasSessionDefault;

  if (hasSession(project.sessionName)) {
    return { sessionName: project.sessionName, started: false };
  }

  const launch = deps.launch ?? launchDefault;
  try {
    await launch(project.dir, { json: false, attach: false });
  } catch (err) {
    throw new ActionError({
      code: "launch_failed",
      message: `Failed to launch session "${project.sessionName}": ${(err as Error).message ?? String(err)}`,
      details: { sessionName: project.sessionName, dir: project.dir },
      cause: err,
    });
  }

  return { sessionName: project.sessionName, started: true };
}
