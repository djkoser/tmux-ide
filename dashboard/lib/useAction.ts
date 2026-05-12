"use client";

import { useCallback, useRef, useState } from "react";
import { ActionInvocationError, dispatch } from "./actionClient";
import type { ActionInput, ActionName, ActionResult } from "@tmux-ide/contracts";

export interface UseActionResult<Name extends ActionName> {
  /**
   * Fire the action with the given input. Resolves with the typed
   * result on success, returns `null` on failure (the typed error is
   * exposed via the `error` field). Each call is a fresh dispatch —
   * no caching, no de-duplication. Suitable for click handlers.
   */
  dispatch(input: ActionInput<Name>): Promise<ActionResult<Name> | null>;
  pending: boolean;
  error: ActionInvocationError | Error | null;
  lastResult: ActionResult<Name> | null;
}

/**
 * One-shot action invoker for use in React event handlers. Tracks
 * loading + error state and surfaces typed errors via
 * `ActionInvocationError` (network errors fall through as plain
 * `Error`).
 *
 * - Each `dispatch` call clears any prior error and flips `pending` to
 *   `true` for the duration of the in-flight request.
 * - On success, `lastResult` is updated and `error` cleared.
 * - On failure, `error` is set to the typed/native error and persists
 *   until the next dispatch starts.
 */
export function useAction<Name extends ActionName>(name: Name): UseActionResult<Name> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionInvocationError | Error | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult<Name> | null>(null);
  // Track in-flight runs so a fast re-click doesn't accidentally let a
  // stale response overwrite a fresher one.
  const runIdRef = useRef(0);

  const run = useCallback(
    async (input: ActionInput<Name>): Promise<ActionResult<Name> | null> => {
      const myRun = runIdRef.current + 1;
      runIdRef.current = myRun;
      setPending(true);
      setError(null);
      try {
        const result = await dispatch(name, input);
        if (runIdRef.current === myRun) {
          setLastResult(result);
          setPending(false);
        }
        return result;
      } catch (err) {
        if (runIdRef.current === myRun) {
          if (err instanceof ActionInvocationError) {
            setError(err);
          } else if (err instanceof Error) {
            setError(err);
          } else {
            setError(new Error(String(err)));
          }
          setPending(false);
        }
        return null;
      }
    },
    [name],
  );

  return { dispatch: run, pending, error, lastResult };
}
