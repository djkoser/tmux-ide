"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import type { OnboardProjectInput, ProjectInspect, RegisteredProject } from "@/lib/api";
import {
  buildOnboardInput,
  defaultStateFromInspect,
  existingProjectNames,
  fieldError,
  isStepReachable,
  nextStep,
  prevStep,
  previewIdeYml,
  setAgentName,
  setAgents,
  setStep,
  validateAll,
  validateStep,
  ONBOARD_STEPS,
  type AgentsCount,
  type OnboardState,
  type OnboardStep,
} from "./OnboardingWizard.logic";

/**
 * Multi-step onboarding wizard — appears under the directory browser when
 * the user picks a folder that has no `ide.yml`. Walks through Basics,
 * Agents, Tools, and Review tabs before composing a config and submitting
 * to `POST /api/projects/onboard`.
 *
 * Rendering only — defaults, validation, the step machine, and the
 * preview YAML composer all live in `OnboardingWizard.logic.ts`.
 */
export interface OnboardingWizardProps {
  inspect: ProjectInspect;
  /** Already-registered projects, used for name uniqueness validation. */
  existingProjects?: readonly RegisteredProject[];
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (input: OnboardProjectInput) => void;
}

const STEP_LABELS: Record<OnboardStep, string> = {
  basics: "Basics",
  agents: "Agents",
  tools: "Tools",
  review: "Review",
};

export function OnboardingWizard({
  inspect,
  existingProjects = [],
  submitting,
  onCancel,
  onSubmit,
}: OnboardingWizardProps) {
  const existingNames = useMemo(() => existingProjectNames(existingProjects), [existingProjects]);
  const [state, setState] = useState<OnboardState>(() =>
    defaultStateFromInspect(inspect, existingNames),
  );

  const validateOpts = useMemo(
    () => ({ existingNames, allowName: inspect.name }),
    [existingNames, inspect.name],
  );

  const currentStepValidation = useMemo(
    () => validateStep(state, state.step, validateOpts),
    [state, validateOpts],
  );

  const overallValidation = useMemo(
    () => validateAll(state, validateOpts),
    [state, validateOpts],
  );

  const stackSummary = useMemo(() => {
    const fws = inspect.detected.frameworks;
    const pm = inspect.detected.packageManager;
    const parts: string[] = [];
    if (fws.length > 0) parts.push(fws.join(", "));
    if (pm) parts.push(pm);
    return parts.length > 0 ? `Detected: ${parts.join(", ")}` : "No framework signals detected";
  }, [inspect.detected]);

  const goNext = () => {
    if (!currentStepValidation.valid) return;
    const next = nextStep(state);
    if (next) setState((s) => setStep(s, next));
  };

  const goBack = () => {
    const prev = prevStep(state);
    if (prev) setState((s) => setStep(s, prev));
  };

  const goTo = (target: OnboardStep) => {
    if (!isStepReachable(state, target, validateOpts)) return;
    setState((s) => setStep(s, target));
  };

  const handleSubmit = () => {
    if (!overallValidation.valid) return;
    onSubmit(buildOnboardInput(state, inspect));
  };

  const isLastStep = state.step === "review";

  return (
    <div
      data-testid="onboarding-wizard"
      className="rounded-md border border-[var(--border-weak)] bg-[var(--surface)]"
    >
      <div className="border-b border-[var(--border-weak)] px-3 py-2">
        <h3 className="text-[12px] font-medium text-[var(--fg)]">
          Set up tmux-ide for &quot;{inspect.name}&quot;
        </h3>
        <p className="text-[11px] text-[var(--dim)]">
          No <code>ide.yml</code> here yet — we&apos;ll create one for you.
        </p>
      </div>

      <div className="flex min-h-[280px]">
        <StepRail state={state} validateOpts={validateOpts} onGoTo={goTo} />
        <div className="flex-1 px-4 py-3">
          {state.step === "basics" && (
            <BasicsStep
              state={state}
              setState={setState}
              stackSummary={stackSummary}
              dir={inspect.dir}
              error={fieldError(currentStepValidation, "name")}
            />
          )}
          {state.step === "agents" && (
            <AgentsStep state={state} setState={setState} validation={currentStepValidation} />
          )}
          {state.step === "tools" && (
            <ToolsStep
              state={state}
              setState={setState}
              inspect={inspect}
              error={fieldError(currentStepValidation, "devCommand")}
            />
          )}
          {state.step === "review" && <ReviewStep state={state} />}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-weak)] px-3 py-2">
        <Button
          variant="ghost"
          data-testid="onboarding-cancel"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        {state.step !== "basics" && (
          <Button
            variant="ghost"
            data-testid="onboarding-back"
            onClick={goBack}
            disabled={submitting}
          >
            Back
          </Button>
        )}
        {!isLastStep && (
          <Button
            data-testid="onboarding-next"
            onClick={goNext}
            disabled={!currentStepValidation.valid || submitting}
          >
            Next
          </Button>
        )}
        {isLastStep && (
          <Button
            data-testid="onboarding-submit"
            onClick={handleSubmit}
            isPending={submitting}
            disabled={!overallValidation.valid || submitting}
          >
            Create
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step rail
// ---------------------------------------------------------------------------

interface StepRailProps {
  state: OnboardState;
  validateOpts: { existingNames: readonly string[]; allowName: string };
  onGoTo: (step: OnboardStep) => void;
}

function StepRail({ state, validateOpts, onGoTo }: StepRailProps) {
  const currentIdx = ONBOARD_STEPS.indexOf(state.step);
  return (
    <ul
      data-testid="onboarding-step-rail"
      className="flex w-[140px] shrink-0 flex-col gap-0.5 border-r border-[var(--border-weak)] py-2"
    >
      {ONBOARD_STEPS.map((step, idx) => {
        const isActive = step === state.step;
        const isCompleted = idx < currentIdx;
        const reachable = isStepReachable(state, step, validateOpts);
        return (
          <li key={step}>
            <button
              type="button"
              data-testid={`onboarding-step-${step}`}
              data-active={isActive ? "true" : "false"}
              data-completed={isCompleted ? "true" : "false"}
              onClick={() => onGoTo(step)}
              disabled={!reachable}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                isActive
                  ? "bg-[var(--surface-2)] text-[var(--fg)]"
                  : reachable
                    ? "text-[var(--fg)] hover:bg-[var(--surface-2)]"
                    : "text-[var(--dim)] opacity-50"
              }`}
            >
              <StepDot active={isActive} completed={isCompleted} />
              <span>{STEP_LABELS[step]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StepDot({ active, completed }: { active: boolean; completed: boolean }) {
  if (completed) {
    return (
      <span
        aria-hidden="true"
        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--bg)]"
      >
        <Check size={9} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 rounded-full ${
        active ? "bg-[var(--accent)]" : "bg-[var(--border-weak)]"
      }`}
    />
  );
}

// ---------------------------------------------------------------------------
// Step bodies
// ---------------------------------------------------------------------------

interface BasicsStepProps {
  state: OnboardState;
  setState: React.Dispatch<React.SetStateAction<OnboardState>>;
  stackSummary: string;
  dir: string;
  error: string | null;
}

function BasicsStep({ state, setState, stackSummary, dir, error }: BasicsStepProps) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Project name
        </span>
        <input
          data-testid="onboarding-name"
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
        />
        {error && (
          <span className="mt-1 block text-[11px] text-[var(--red)]">{error}</span>
        )}
      </label>

      <div>
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Working directory
        </span>
        <div
          data-testid="onboarding-dir"
          className="mt-1 truncate rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--dim)]"
          title={dir}
        >
          {dir}
        </div>
      </div>

      <div className="text-[11px] text-[var(--dim)]" data-testid="onboarding-stack">
        {stackSummary}
      </div>
    </div>
  );
}

interface AgentsStepProps {
  state: OnboardState;
  setState: React.Dispatch<React.SetStateAction<OnboardState>>;
  validation: { errors: Record<string, string> };
}

const AGENT_EXPLANATIONS: Record<AgentsCount, string> = {
  1: "One Claude pane. Solo coding.",
  2: "Lead + Teammate. Pair-programming with two agents.",
  3: "Lead + 2 Teammates. Three agents on one mission.",
};

function AgentsStep({ state, setState, validation }: AgentsStepProps) {
  return (
    <div className="space-y-3">
      <div>
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Number of agents
        </span>
        <div className="mt-1 flex gap-1">
          {([1, 2, 3] as AgentsCount[]).map((n) => {
            const active = state.agents === n;
            return (
              <button
                key={n}
                type="button"
                data-testid={`onboarding-agents-${n}`}
                data-active={active ? "true" : "false"}
                onClick={() => setState((s) => setAgents(s, n))}
                className={`flex h-7 min-w-[2.5rem] items-center justify-center rounded-md border px-3 text-[11px] transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]"
                    : "border-[var(--border-weak)] text-[var(--fg)] hover:border-[var(--accent)]"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <span className="mt-1 block text-[11px] text-[var(--dim)]">
          {AGENT_EXPLANATIONS[state.agents]}
        </span>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Agent names
        </span>
        <div className="space-y-1.5">
          {state.agentNames.map((name, i) => {
            const slotError = validation.errors[`agentName_${i}`];
            return (
              <label key={i} className="block">
                <input
                  data-testid={`onboarding-agent-name-${i}`}
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setState((s) => setAgentName(s, i, e.target.value))
                  }
                  className="w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
                />
                {slotError && (
                  <span className="mt-1 block text-[11px] text-[var(--red)]">{slotError}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ToolsStepProps {
  state: OnboardState;
  setState: React.Dispatch<React.SetStateAction<OnboardState>>;
  inspect: ProjectInspect;
  error: string | null;
}

function ToolsStep({ state, setState, inspect, error }: ToolsStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--dim)]">
        tmux-ide will create panes for each command. Leave blank to skip.
      </p>

      <div>
        <label className="flex items-center gap-2 text-[11px] text-[var(--fg)]">
          <input
            data-testid="onboarding-dev-toggle"
            type="checkbox"
            checked={state.devEnabled}
            onChange={(e) => setState((s) => ({ ...s, devEnabled: e.target.checked }))}
            className="h-3 w-3"
          />
          <span>Add a dev server pane</span>
        </label>
        {state.devEnabled && (
          <div className="mt-1">
            {inspect.detected.devCommand && (
              <span className="block text-[11px] text-[var(--dim)]">
                Detected: {inspect.detected.devCommand}
              </span>
            )}
            <input
              data-testid="onboarding-dev-cmd"
              type="text"
              value={state.devCommand}
              onChange={(e) => setState((s) => ({ ...s, devCommand: e.target.value }))}
              placeholder="pnpm dev"
              className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
            />
            {error && (
              <span className="mt-1 block text-[11px] text-[var(--red)]">{error}</span>
            )}
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Test command (optional)
        </span>
        <input
          data-testid="onboarding-test-cmd"
          type="text"
          value={state.testCommand}
          onChange={(e) => setState((s) => ({ ...s, testCommand: e.target.value }))}
          placeholder={inspect.detected.testCommand ?? "pnpm test"}
          className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Lint command (optional)
        </span>
        <input
          data-testid="onboarding-lint-cmd"
          type="text"
          value={state.lintCommand}
          onChange={(e) => setState((s) => ({ ...s, lintCommand: e.target.value }))}
          placeholder="pnpm lint"
          className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
        />
      </label>
    </div>
  );
}

function ReviewStep({ state }: { state: OnboardState }) {
  const yaml = useMemo(() => previewIdeYml(state), [state]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[var(--dim)]">
        Preview of <code>ide.yml</code> we&apos;ll write into your project:
      </p>
      <pre
        data-testid="onboarding-preview"
        className="max-h-[260px] overflow-auto rounded-md border border-[var(--border-weak)] bg-[var(--bg)] p-3 font-mono text-[11px] leading-5 text-[var(--fg)]"
      >
        {yaml}
      </pre>
    </div>
  );
}
