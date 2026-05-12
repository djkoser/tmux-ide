/**
 * Bootstraps + recovers the chat-v2 store for the active thread.
 *
 * Lifecycle:
 *   1. On `activeThreadId` change → `beginSnapshotRecovery("bootstrap")`,
 *      fetch `GET /api/threads/:id`, feed messages through
 *      `hydrateFromThreadState`, then `completeSnapshotRecovery`.
 *   2. Live WS frames flow through the existing `useChatV2WsBridge`.
 *      Once chat-v2 ships per-thread seq gates, this hook will install
 *      a `classifyDomainEvent` filter before `applyEvent` — but
 *      activity events already include `seq`, so the wiring is
 *      straightforward once the bridge is parameterized.
 *   3. Re-mount (e.g. page reload, route change) re-runs the bootstrap.
 *
 * Returns the per-thread coordinator state so the UI can render a
 * recovery badge ("Restoring transcript…") while bootstrap is in flight.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { chatThreadGet } from "@/lib/api";
import {
  OrchestrationRecoveryRegistry,
  type OrchestrationRecoveryState,
} from "@/lib/orchestrationRecovery";
import { useChatStore } from "./useChatStore";

export interface OrchestrationRecoveryStatus {
  /** Current coordinator state for the active thread, or null if no thread. */
  state: OrchestrationRecoveryState | null;
  /** True while the bootstrap fetch is in flight. */
  bootstrapping: boolean;
  /** True after the first successful bootstrap for the active thread. */
  ready: boolean;
  /** Last error encountered while fetching the snapshot. */
  error: Error | null;
}

const INITIAL_STATUS: OrchestrationRecoveryStatus = {
  state: null,
  bootstrapping: false,
  ready: false,
  error: null,
};

export function useOrchestrationRecovery(
  activeThreadId: string | null,
): OrchestrationRecoveryStatus {
  const hydrate = useChatStore((s) => s.hydrateFromThreadState);
  const registryRef = useRef<OrchestrationRecoveryRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new OrchestrationRecoveryRegistry();
  const registry = registryRef.current;

  const [status, setStatus] = useState<OrchestrationRecoveryStatus>(INITIAL_STATUS);

  useEffect(() => {
    if (!activeThreadId) {
      setStatus(INITIAL_STATUS);
      return;
    }
    const coordinator = registry.forThread(activeThreadId);
    const started = coordinator.beginSnapshotRecovery("bootstrap");
    if (!started) {
      // Another in-flight bootstrap — let it run. The pendingReplay
      // flag inside the coordinator queues us for a follow-up.
      setStatus({
        state: coordinator.getState(),
        bootstrapping: true,
        ready: false,
        error: null,
      });
      return;
    }
    setStatus({
      state: coordinator.getState(),
      bootstrapping: true,
      ready: false,
      error: null,
    });

    let cancelled = false;
    chatThreadGet(activeThreadId)
      .then((threadState) => {
        if (cancelled) return;
        if (!threadState) {
          // 404 — treat as a brand-new thread (no history yet). Still
          // complete the snapshot so the coordinator transitions to
          // `bootstrapped` and the WS path can apply live events.
          coordinator.completeSnapshotRecovery(0);
          setStatus({
            state: coordinator.getState(),
            bootstrapping: false,
            ready: true,
            error: null,
          });
          return;
        }
        hydrate(activeThreadId, threadState);
        const snapshotSeq = Math.max(0, threadState.messages.length - 1);
        coordinator.completeSnapshotRecovery(snapshotSeq);
        setStatus({
          state: coordinator.getState(),
          bootstrapping: false,
          ready: true,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        coordinator.failSnapshotRecovery();
        setStatus({
          state: coordinator.getState(),
          bootstrapping: false,
          ready: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, hydrate, registry]);

  return useMemo(() => status, [status]);
}
