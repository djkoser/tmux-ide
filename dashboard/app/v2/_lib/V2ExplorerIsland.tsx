"use client";

/**
 * React → Solid island wrapper for the v2 Explorer widget.
 *
 * Mirrors V2CostsIsland: dynamically imports @tmux-ide/v2-solid-widgets,
 * mounts via mountExplorer, returns a handle so we can update options
 * (sessionName, onOpenFile) without remounting on prop changes.
 *
 * The `onOpenFile` callback is intentionally re-pushed every render so
 * the host's closure (e.g. `openInPreview` from ProjectV2Page) always
 * reflects the latest state.
 */

import { useEffect, useRef } from "react";
import { resolveApiBase, resolveAuthToken } from "@/lib/appProtocol";

interface V2ExplorerIslandProps {
  projectName: string;
  onOpenFile?: (path: string) => void;
}

export function V2ExplorerIsland({ projectName, onOpenFile }: V2ExplorerIslandProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<{
    unmount(): void;
    setOptions(next: {
      sessionName?: string;
      apiBaseUrl?: string;
      bearerToken?: string | null;
      onOpenFile?: (path: string) => void;
    }): void;
  } | null>(null);
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountExplorer(el, {
        sessionName: projectName,
        apiBaseUrl: resolveApiBase(),
        bearerToken: resolveAuthToken(),
        onOpenFile: (path: string) => onOpenFileRef.current?.(path),
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
      data-testid="v2-explorer-island"
      data-session-name={projectName}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}
