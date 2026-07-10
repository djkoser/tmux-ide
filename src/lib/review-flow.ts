import type { Task } from "./task-store.ts";

/**
 * Roles allowed to mark a task done / reopen it. Alias-tolerant so the config
 * repo can rename the role from "validator" to "reviewer" without breaking the
 * CLI during the transition — never hardcode a single literal against these.
 */
export const REVIEWER_ROLES = new Set(["validator", "reviewer"]);

export function isReviewerRole(role: string | null | undefined): boolean {
  return role != null && REVIEWER_ROLES.has(role);
}

export interface TransitionActor {
  name: string | null;
  role: string | null;
}

export interface GuardResult {
  ok: boolean;
  error?: string;
}

/**
 * Enforce the review-flow invariant for marking a task done:
 *  - the task must be in `review` (done is unreachable by skipping review);
 *  - only a validator/reviewer actor may perform it.
 * An explicit operator override bypasses both (the caller logs it).
 */
export function canMarkDone(task: Task, actor: TransitionActor, override = false): GuardResult {
  if (override) return { ok: true };
  if (task.status !== "review") {
    return {
      ok: false,
      error: `Task ${task.id} is '${task.status}'; it must be in 'review' before it can be marked done. Move it to review first (writers only ever move to review).`,
    };
  }
  if (!isReviewerRole(actor.role)) {
    return {
      ok: false,
      error: `Only the validator/reviewer may mark a task done (actor: ${actor.name ?? "unknown"}, role: ${actor.role ?? "unknown"}). Use --override to force as a human operator.`,
    };
  }
  return { ok: true };
}

/**
 * Reopening a reviewed task (review → todo) is a validator/reviewer or lead
 * action; an override bypasses it. Assignees cannot silently re-arm their own
 * task.
 */
export function canReopen(actor: TransitionActor, override = false): GuardResult {
  if (override) return { ok: true };
  if (isReviewerRole(actor.role) || actor.role === "lead") return { ok: true };
  return {
    ok: false,
    error: `Only the validator/reviewer or lead may reopen a task (actor: ${actor.name ?? "unknown"}, role: ${actor.role ?? "unknown"}). Use --override to force as a human operator.`,
  };
}
