"use client";

/**
 * React → Solid island wrapper for the v2 Changes widget.
 *
 * Mirrors V2CostsIsland.tsx structure: dynamic import + mountChanges +
 * setOptions on prop change. Read-only diff browser; no callbacks.
 */

import { useEffect, useRef } from "react";
import { resolveApiBase, resolveAuthToken } from "@/lib/appProtocol";

interface V2ChangesIslandProps {
  projectName: string;
}

export function V2ChangesIsland({ projectName }: V2ChangesIslandProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<{
    unmount(): void;
    setOptions(next: {
      sessionName?: string;
      apiBaseUrl?: string;
      bearerToken?: string | null;
    }): void;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountChanges(el, {
        sessionName: projectName,
        apiBaseUrl: resolveApiBase(),
        bearerToken: resolveAuthToken(),
      });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setOptions({
      sessionName: projectName,
      apiBaseUrl: resolveApiBase(),
      bearerToken: resolveAuthToken(),
    });
  }, [projectName]);

  return (
    <div
      ref={containerRef}
      data-testid="v2-changes-island"
      data-session-name={projectName}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}
