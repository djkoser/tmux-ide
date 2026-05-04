import type { OnboardProjectInput, ProjectInspect, RegisteredProject } from "@/lib/api";

/**
 * Pure logic for the onboarding wizard. The .tsx companion is rendering
 * only — defaults, validation, the step state machine, and the API payload
 * all live here so they are unit-testable in isolation.
 */

export type AgentsCount = 1 | 2 | 3;

export type OnboardStep = "basics" | "agents" | "tools" | "review";

export const ONBOARD_STEPS: readonly OnboardStep[] = [
  "basics",
  "agents",
  "tools",
  "review",
] as const;

export interface OnboardState {
  /** Active step. */
  step: OnboardStep;
  /** Step 1 — project name; pre-filled from inspect.name. */
  name: string;
  /** Step 2 — 1, 2, or 3 Claude panes. */
  agents: AgentsCount;
  /** Step 2 — per-agent role names (length === agents). */
  agentNames: string[];
  /** Step 3 — whether to add a Dev pane. */
  devEnabled: boolean;
  /** Step 3 — editable dev command; pre-filled from inspect.detected.devCommand. */
  devCommand: string;
  /** Step 3 — optional test command. */
  testCommand: string;
  /** Step 3 — optional lint command. */
  lintCommand: string;
}

const NAME_RE = /^[a-zA-Z0-9_.-]+$/;

/**
 * Default agent names by index. The first agent is the lead, followed by
 * teammates. For solo (`agents === 1`) we only ever use index 0 → "Claude".
 */
function defaultAgentNames(agents: AgentsCount): string[] {
  if (agents === 1) return ["Claude"];
  const names = ["Lead"];
  for (let i = 1; i < agents; i++) {
    names.push(`Teammate ${i}`);
  }
  return names;
}

/**
 * Build initial state from a directory inspect result. `existingNames` is
 * the list of already-registered project names — used by validation to
 * surface a uniqueness error before the user clicks Create.
 */
export function defaultStateFromInspect(
  inspect: ProjectInspect,
  _existingNames: readonly string[] = [],
): OnboardState {
  const devCommand = inspect.detected.devCommand ?? "";
  const agents: AgentsCount = 2;
  return {
    step: "basics",
    name: inspect.name,
    agents,
    agentNames: defaultAgentNames(agents),
    devEnabled: devCommand.length > 0,
    devCommand,
    testCommand: inspect.detected.testCommand ?? "",
    lintCommand: "",
  };
}

/** Pure setter: switches step. */
export function setStep(state: OnboardState, step: OnboardStep): OnboardState {
  return { ...state, step };
}

/**
 * Resize agentNames when the agent count changes. Preserves edited names
 * for slots that still exist, fills new slots with defaults.
 */
export function setAgents(state: OnboardState, n: AgentsCount): OnboardState {
  if (state.agents === n) return state;
  const defaults = defaultAgentNames(n);
  const next: string[] = [];
  for (let i = 0; i < n; i++) {
    // Keep what the user typed when going from 1→2 only if the role meaning
    // stays the same. Going from 1 (solo "Claude") to 2 (team Lead+Teammate)
    // changes the meaning of slot 0, so reset to defaults instead of
    // dragging the old name forward. Going from 2→3, slot 0/1 still mean
    // Lead/Teammate-1, so preserve.
    const sameSemantics = (state.agents > 1) === (n > 1);
    const prior = state.agentNames[i];
    if (sameSemantics && prior !== undefined && prior.trim().length > 0) {
      next.push(prior);
    } else {
      next.push(defaults[i]!);
    }
  }
  return { ...state, agents: n, agentNames: next };
}

/** Pure setter: rename one agent slot. */
export function setAgentName(state: OnboardState, index: number, name: string): OnboardState {
  if (index < 0 || index >= state.agentNames.length) return state;
  const next = state.agentNames.slice();
  next[index] = name;
  return { ...state, agentNames: next };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface OnboardValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface ValidateOptions {
  existingNames?: readonly string[];
  /** When the inspect.name matches an already-registered project, allow it
   *  here so editing flows don't trip on themselves. */
  allowName?: string;
}

/**
 * Validate one step in isolation. Each step gates "Next" based only on its
 * own fields. The final overall validity is "every step valid".
 */
export function validateStep(
  state: OnboardState,
  step: OnboardStep,
  opts: ValidateOptions = {},
): OnboardValidationResult {
  const errors: Record<string, string> = {};
  if (step === "basics") {
    const trimmed = state.name.trim();
    if (!trimmed) {
      errors.name = "Pick a project name";
    } else if (!NAME_RE.test(trimmed)) {
      errors.name = "Use letters, digits, dot, dash, or underscore";
    } else if (
      opts.existingNames &&
      trimmed !== opts.allowName &&
      opts.existingNames.includes(trimmed)
    ) {
      errors.name = "A project with that name is already registered";
    }
  } else if (step === "agents") {
    if (state.agents !== 1 && state.agents !== 2 && state.agents !== 3) {
      errors.agents = "Pick 1, 2, or 3 agents";
    }
    if (state.agentNames.length !== state.agents) {
      errors.agentNames = "Agent names out of sync with count";
    } else {
      for (let i = 0; i < state.agentNames.length; i++) {
        if (!state.agentNames[i]!.trim()) {
          errors[`agentName_${i}`] = "Each agent needs a name";
        }
      }
    }
  } else if (step === "tools") {
    if (state.devEnabled && !state.devCommand.trim()) {
      errors.devCommand = "Enter a dev command";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate every step. Used to enable the final "Create" button on Review.
 */
export function validateAll(
  state: OnboardState,
  opts: ValidateOptions = {},
): OnboardValidationResult {
  const errors: Record<string, string> = {};
  for (const step of ONBOARD_STEPS) {
    if (step === "review") continue;
    const result = validateStep(state, step, opts);
    Object.assign(errors, result.errors);
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * A step is "reachable" via the rail if it's the current step, an earlier
 * step (always reachable to go back), or all earlier steps validate (so the
 * user can jump to Review once everything earlier is filled in).
 */
export function isStepReachable(
  state: OnboardState,
  step: OnboardStep,
  opts: ValidateOptions = {},
): boolean {
  const targetIdx = ONBOARD_STEPS.indexOf(step);
  const currentIdx = ONBOARD_STEPS.indexOf(state.step);
  if (targetIdx <= currentIdx) return true;
  for (let i = 0; i < targetIdx; i++) {
    const result = validateStep(state, ONBOARD_STEPS[i]!, opts);
    if (!result.valid) return false;
  }
  return true;
}

/** Returns the next step or `null` if already on the last one. */
export function nextStep(state: OnboardState): OnboardStep | null {
  const idx = ONBOARD_STEPS.indexOf(state.step);
  if (idx === -1 || idx === ONBOARD_STEPS.length - 1) return null;
  return ONBOARD_STEPS[idx + 1]!;
}

/** Returns the previous step or `null` if already on the first one. */
export function prevStep(state: OnboardState): OnboardStep | null {
  const idx = ONBOARD_STEPS.indexOf(state.step);
  if (idx <= 0) return null;
  return ONBOARD_STEPS[idx - 1]!;
}

// ---------------------------------------------------------------------------
// Wire payload + YAML preview
// ---------------------------------------------------------------------------

/**
 * Build the `POST /api/projects/onboard` payload. Pure: never throws,
 * never reads. The component should call `validateAll` first.
 */
export function buildOnboardInput(state: OnboardState, inspect: ProjectInspect): OnboardProjectInput {
  const trimmedName = state.name.trim();
  const trimmedDev = state.devCommand.trim();
  const trimmedTest = state.testCommand.trim();
  const trimmedLint = state.lintCommand.trim();
  const payload: OnboardProjectInput = {
    dir: inspect.dir,
    agents: state.agents,
    devCommand: state.devEnabled && trimmedDev ? trimmedDev : null,
  };
  if (trimmedName && trimmedName !== inspect.name) {
    payload.name = trimmedName;
  }
  if (trimmedTest) {
    payload.testCommand = trimmedTest;
  }
  if (trimmedLint) {
    payload.lintCommand = trimmedLint;
  }
  // Only send agentNames if the user customized at least one — otherwise
  // let the server pick defaults so the wire payload stays minimal.
  const defaults = defaultAgentNames(state.agents);
  const customized = state.agentNames.some(
    (name, i) => name.trim() !== defaults[i]!.trim(),
  );
  if (customized) {
    payload.agentNames = state.agentNames.map((n) => n.trim());
  }
  return payload;
}

/**
 * Convenience: extract the validation error for a given field. Returns
 * `null` when the field has no error.
 */
export function fieldError(
  result: OnboardValidationResult,
  field: string,
): string | null {
  return result.errors[field] ?? null;
}

/**
 * Extract registered project names from `useProjects().projects`. Helper
 * so the .tsx doesn't need to know about RegisteredProject internals.
 */
export function existingProjectNames(projects: readonly RegisteredProject[]): string[] {
  return projects.map((p) => p.name);
}

// ---------------------------------------------------------------------------
// Client-side YAML preview
//
// Mirrors the shape produced by `composeIdeYmlConfig` in
// src/lib/project-onboard.ts. We hand-roll YAML emission rather than pull
// in js-yaml because the shape is small, the output is read-only, and the
// dashboard already avoids runtime dependencies that aren't strictly
// required for production.
// ---------------------------------------------------------------------------

interface PreviewPane {
  title: string;
  command?: string;
  role?: "lead" | "teammate";
  focus?: boolean;
}

interface PreviewRow {
  size?: string;
  panes: PreviewPane[];
}

interface PreviewConfig {
  name: string;
  rows: PreviewRow[];
  team?: { name: string };
}

/** Turn wizard state into the preview config (same shape as the server). */
export function previewIdeConfig(state: OnboardState): PreviewConfig {
  const trimmedName = state.name.trim() || "project";
  const useTeam = state.agents > 1;
  const topPanes: PreviewPane[] = [];
  for (let i = 0; i < state.agents; i++) {
    const customName = state.agentNames[i]?.trim();
    const fallback = useTeam ? (i === 0 ? "Lead" : `Teammate ${i}`) : `Claude ${i + 1}`;
    const pane: PreviewPane = {
      title: customName && customName.length > 0 ? customName : fallback,
      command: "claude",
    };
    if (useTeam) {
      pane.role = i === 0 ? "lead" : "teammate";
    }
    if (i === 0) {
      pane.focus = true;
    }
    topPanes.push(pane);
  }

  const bottomPanes: PreviewPane[] = [];
  const trimmedDev = state.devCommand.trim();
  if (state.devEnabled && trimmedDev) {
    bottomPanes.push({ title: "Dev", command: trimmedDev });
  }
  bottomPanes.push({ title: "Shell" });

  const config: PreviewConfig = {
    name: trimmedName,
    rows: [
      { size: "70%", panes: topPanes },
      { panes: bottomPanes },
    ],
  };
  if (useTeam) {
    config.team = { name: trimmedName };
  }
  return config;
}

/**
 * Serialize a preview config as YAML. Mirrors the canonical output shape
 * `js-yaml` produces server-side (double-quoted strings when needed,
 * 2-space indent, no anchors, no flow style).
 */
export function previewIdeYml(state: OnboardState): string {
  const config = previewIdeConfig(state);
  const lines: string[] = [];
  lines.push(`name: ${quoteIfNeeded(config.name)}`);
  if (config.team) {
    lines.push(`team:`);
    lines.push(`  name: ${quoteIfNeeded(config.team.name)}`);
  }
  lines.push(`rows:`);
  for (const row of config.rows) {
    let first = true;
    if (row.size !== undefined) {
      lines.push(`  - size: ${quoteIfNeeded(row.size)}`);
      lines.push(`    panes:`);
      first = false;
    } else {
      lines.push(`  - panes:`);
      first = false;
    }
    void first;
    for (const pane of row.panes) {
      lines.push(`      - title: ${quoteIfNeeded(pane.title)}`);
      if (pane.command !== undefined) {
        lines.push(`        command: ${quoteIfNeeded(pane.command)}`);
      }
      if (pane.role !== undefined) {
        lines.push(`        role: ${pane.role}`);
      }
      if (pane.focus) {
        lines.push(`        focus: true`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Quote a YAML scalar when js-yaml's default emit would. Conservatively
 * quotes anything containing whitespace, special chars, or that parses as
 * a non-string token.
 */
function quoteIfNeeded(value: string): string {
  if (value === "") return '""';
  // YAML reserved words / special tokens that must be quoted.
  const reserved = /^(true|false|null|yes|no|on|off|~)$/i;
  if (reserved.test(value)) return `"${value}"`;
  // Strings that look like numbers must be quoted.
  if (/^-?\d+(\.\d+)?$/.test(value)) return `"${value}"`;
  // Whitespace / shell metacharacters / colons trigger quoting.
  if (/[\s:#&*!|>'"%@`,\[\]{}]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
