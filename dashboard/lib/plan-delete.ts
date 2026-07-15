export type DeleteConfirmState = string | null;

export interface DeleteClickDecision {
  fire: boolean;
  next: DeleteConfirmState;
}

/**
 * Two-step delete affordance. The first click on a plan's delete button arms
 * the confirm for that plan only; a second click on the same plan fires the
 * delete. Clicking a different plan's button re-arms onto that plan instead of
 * firing, so a single stray click can never delete anything.
 */
export function deleteClick(current: DeleteConfirmState, path: string): DeleteClickDecision {
  if (current === path) return { fire: true, next: null };
  return { fire: false, next: path };
}

export interface DeleteResultEffects {
  error: string | null;
  clearSelection: boolean;
  refresh: boolean;
}

/**
 * Effects to apply after the server responds to a delete. A failure surfaces
 * an error and leaves the list/selection untouched; a success refreshes the
 * list and clears the selection only when the deleted plan was the one open.
 */
export function applyDeleteResult(
  ok: boolean,
  path: string,
  selectedFile: string | null,
): DeleteResultEffects {
  if (!ok) {
    return {
      error: "Delete failed — the server rejected it. The plan is unchanged.",
      clearSelection: false,
      refresh: false,
    };
  }
  return { error: null, clearSelection: selectedFile === path, refresh: true };
}
