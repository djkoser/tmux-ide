/**
 * Plan-approve-execute card rendered inline in the chat activity
 * stream when an activity has kind="propose-plan" or carries a plan
 * payload. T076 wires the approve/reject buttons; the deeper UI lives
 * in T077 (dashboard rebuild).
 *
 * The component is a thin presentational wrapper: it calls the props
 * callbacks and tracks a local `pending` state so the buttons disable
 * while a request is in flight. The actual HTTP call (typed via
 * @tmux-ide/contracts) is supplied by the caller.
 */

import { useState } from "react";
import type { ProposedPlanView } from "./useChatStore";

export interface PlanCardStubProps {
  plan: ProposedPlanView;
  threadId: string;
  onApprove?: (input: { threadId: string; planId: string }) => Promise<void> | void;
  onReject?: (input: { threadId: string; planId: string; reason?: string }) => Promise<void> | void;
}

type CardStatus = "pending" | "implemented" | "rejected";

function statusOf(plan: ProposedPlanView): CardStatus {
  if (plan.implementedAt) return "implemented";
  if (plan.rejected) return "rejected";
  return "pending";
}

export function PlanCardStub({ plan, threadId, onApprove, onReject }: PlanCardStubProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = statusOf(plan);
  const canAct = status === "pending";

  async function handleApprove() {
    if (!onApprove || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onApprove({ threadId, planId: plan.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!onReject || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onReject({ threadId, planId: plan.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="plan-card-stub"
      data-plan-id={plan.id}
      data-plan-status={status}
      className="rounded border border-[var(--border-weak)] bg-[var(--surface)] px-3 py-2 text-[11px]"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-[var(--fg)]">Proposed plan</span>
        <span className="text-[10px] text-[var(--dim)]">{status}</span>
      </div>
      <pre className="whitespace-pre-wrap text-[11px] leading-snug text-[var(--fg-soft)]">
        {plan.planMarkdown}
      </pre>
      {plan.rejected?.reason ? (
        <div className="mt-1 text-[10px] text-[var(--dim)]">Reason: {plan.rejected.reason}</div>
      ) : null}
      <div data-testid="plan-card-stub-actions" className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!canAct || busy || !onApprove}
          onClick={handleApprove}
          data-testid="plan-card-approve"
          className="rounded border border-[var(--border-weak)] px-2 py-0.5 text-[10px] uppercase tracking-wider disabled:opacity-50"
        >
          {busy ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={!canAct || busy || !onReject}
          onClick={handleReject}
          data-testid="plan-card-reject"
          className="rounded border border-[var(--border-weak)] px-2 py-0.5 text-[10px] uppercase tracking-wider disabled:opacity-50"
        >
          Reject
        </button>
        {error ? (
          <span data-testid="plan-card-error" className="text-[10px] text-[var(--error)]">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
