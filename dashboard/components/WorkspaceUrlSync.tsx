"use client";

/**
 * WorkspaceUrlSync — Phase Z no-op.
 *
 * The new NavigationState already syncs `window.history.replaceState`
 * on every state change (see `commit()` in `lib/navigation.ts`), so
 * there is nothing for this component to do. It remains as a mount
 * point so existing layout files keep importing the symbol; remove
 * once `(shell)/layout.tsx` is reshaped.
 */
export function WorkspaceUrlSync() {
  return null;
}
