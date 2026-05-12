"use client";

/**
 * React → Solid bridge for the production Diffs viewer.
 *
 * Dynamically imports @tmux-ide/v2-solid-widgets, mounts
 * `mountDiffsViewer` into a container div, and pushes session updates
 * through setOptions on prop change. Mirrors PlansRailBridge.
 *
 * ADR-0001 §1.4 Rule 4: this is the one *Bridge file allowed to call
 * mount() for the diffs viewer.
 */

import { useEffect, useRef } from "react";
import { resolveApiBase, resolveAuthToken } from "@/lib/appProtocol";

interface DiffsViewerBridgeProps {
  sessionName: string;
  initialDiffStyle?: "unified" | "split";
}

type DiffsViewerMountHandle = {
  unmount(): void;
  setOptions(next: {
    sessionName?: string;
    apiBaseUrl?: string;
    bearerToken?: string | null;
    initialDiffStyle?: "unified" | "split";
  }): void;
};

export function DiffsViewerBridge({
  sessionName,
  initialDiffStyle,
}: DiffsViewerBridgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiffsViewerMountHandle | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountDiffsViewer(el, {
        sessionName,
        apiBaseUrl: resolveApiBase(),
        bearerToken: resolveAuthToken(),
        ...(initialDiffStyle ? { initialDiffStyle } : {}),
      });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // Mount once; session updates flow through setOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setOptions({
      sessionName,
      apiBaseUrl: resolveApiBase(),
      bearerToken: resolveAuthToken(),
    });
  }, [sessionName]);

  return (
    <div
      ref={containerRef}
      data-testid="diffs-viewer-bridge"
      data-session-name={sessionName}
      style={{ display: "flex", flex: "1 1 0%", minHeight: 0, minWidth: 0, width: "100%" }}
    />
  );
}
