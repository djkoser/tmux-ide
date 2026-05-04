import type { OnboardProjectInput, ProjectInspect } from "@/lib/api";

/**
 * Pure logic for the onboarding wizard. The .tsx companion is rendering
 * only — defaults, validation, and the API payload all live here so they
 * are unit-testable in isolation.
 */

export type AgentsCount = 1 | 2 | 3;

export interface OnboardingState {
  /** Project name; pre-filled from inspect.name. */
  name: string;
  /** 1, 2, or 3 — how many Claude panes the wizard will scaffold. */
  agents: AgentsCount;
  /** Whether to add a Dev pane. */
  devEnabled: boolean;
  /** Editable dev command; pre-filled from inspect.detected.devCommand. */
  devCommand: string;
  /** Optional test command. */
  testCommand: string;
}

const NAME_RE = /^[a-zA-Z0-9_.-]+$/;

export function defaultStateFromInspect(inspect: ProjectInspect): OnboardingState {
  const devCommand = inspect.detected.devCommand ?? "";
  return {
    name: inspect.name,
    agents: 2,
    devEnabled: devCommand.length > 0,
    devCommand,
    testCommand: inspect.detected.testCommand ?? "",
  };
}

export interface OnboardingValidationError {
  field: "name" | "agents" | "devCommand";
  reason: string;
}

export interface OnboardingValidationResult {
  valid: boolean;
  errors: OnboardingValidationError[];
}

export function validateOnboarding(state: OnboardingState): OnboardingValidationResult {
  const errors: OnboardingValidationError[] = [];
  const trimmedName = state.name.trim();
  if (!trimmedName) {
    errors.push({ field: "name", reason: "Pick a project name" });
  } else if (!NAME_RE.test(trimmedName)) {
    errors.push({
      field: "name",
      reason: "Use letters, digits, dot, dash, or underscore",
    });
  }
  if (state.agents !== 1 && state.agents !== 2 && state.agents !== 3) {
    errors.push({ field: "agents", reason: "Pick 1, 2, or 3 agents" });
  }
  if (state.devEnabled && !state.devCommand.trim()) {
    errors.push({ field: "devCommand", reason: "Enter a dev command" });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Build the wire payload for `POST /api/projects/onboard` from wizard state.
 * Pure: never throws, never reads. The component should call
 * `validateOnboarding` first.
 */
export function buildOnboardInput(
  state: OnboardingState,
  inspect: ProjectInspect,
): OnboardProjectInput {
  const trimmedName = state.name.trim();
  const trimmedDev = state.devCommand.trim();
  const trimmedTest = state.testCommand.trim();
  const payload: OnboardProjectInput = {
    dir: inspect.dir,
    agents: state.agents,
    devCommand: state.devEnabled && trimmedDev ? trimmedDev : null,
  };
  // Only include `name` when it differs from the auto-derived inspect.name —
  // matches how the server defaults but keeps payloads minimal.
  if (trimmedName && trimmedName !== inspect.name) {
    payload.name = trimmedName;
  }
  if (trimmedTest) {
    payload.testCommand = trimmedTest;
  }
  return payload;
}

/**
 * Convenience: extract the first validation error for a given field. The
 * UI uses this to surface inline error text.
 */
export function fieldError(
  result: OnboardingValidationResult,
  field: OnboardingValidationError["field"],
): string | null {
  const found = result.errors.find((e) => e.field === field);
  return found?.reason ?? null;
}
