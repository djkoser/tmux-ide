"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import type { OnboardProjectInput, ProjectInspect } from "@/lib/api";
import {
  buildOnboardInput,
  defaultStateFromInspect,
  fieldError,
  validateOnboarding,
  type AgentsCount,
  type OnboardingState,
} from "./OnboardingWizard.logic";

/**
 * Inline onboarding wizard — appears under the directory browser when the
 * user picks a folder that has no `ide.yml`. Composes a sensible config
 * (agents count, dev pane, project name) and submits to
 * `POST /api/projects/onboard`.
 *
 * Rendering only — defaults, validation, and the payload builder live in
 * `OnboardingWizard.logic.ts`.
 */
export interface OnboardingWizardProps {
  inspect: ProjectInspect;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (input: OnboardProjectInput) => void;
}

export function OnboardingWizard({
  inspect,
  submitting,
  onCancel,
  onSubmit,
}: OnboardingWizardProps) {
  const [state, setState] = useState<OnboardingState>(() => defaultStateFromInspect(inspect));

  const validation = useMemo(() => validateOnboarding(state), [state]);
  const nameError = fieldError(validation, "name");
  const devError = fieldError(validation, "devCommand");

  const handleSubmit = () => {
    if (!validation.valid) return;
    onSubmit(buildOnboardInput(state, inspect));
  };

  const stackSummary = useMemo(() => {
    const fws = inspect.detected.frameworks;
    const pm = inspect.detected.packageManager;
    const parts: string[] = [];
    if (fws.length > 0) parts.push(fws.join(", "));
    if (pm) parts.push(pm);
    return parts.length > 0 ? parts.join(" · ") : "No framework signals detected";
  }, [inspect.detected]);

  return (
    <div
      data-testid="onboarding-wizard"
      className="rounded-md border border-[var(--border-weak)] bg-[var(--surface)] p-3 space-y-3"
    >
      <div>
        <h3 className="text-[12px] font-medium text-[var(--fg)]">
          Set up tmux-ide for &quot;{inspect.name}&quot;
        </h3>
        <p className="text-[11px] text-[var(--dim)]">
          No <code>ide.yml</code> here yet — we&apos;ll create one for you.
        </p>
      </div>

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
        {nameError && <span className="mt-1 block text-[11px] text-[var(--red)]">{nameError}</span>}
      </label>

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
                onClick={() => setState((s) => ({ ...s, agents: n }))}
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
          {state.agents === 1
            ? "1 Claude pane"
            : `${state.agents} Claude panes side by side (team mode)`}
        </span>
      </div>

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
            {devError && (
              <span className="mt-1 block text-[11px] text-[var(--red)]">{devError}</span>
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

      <div className="text-[11px] text-[var(--dim)]">Stack: {stackSummary}</div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          data-testid="onboarding-cancel"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          data-testid="onboarding-submit"
          onClick={handleSubmit}
          isPending={submitting}
          disabled={!validation.valid || submitting}
        >
          Create ide.yml + add
        </Button>
      </div>
    </div>
  );
}
