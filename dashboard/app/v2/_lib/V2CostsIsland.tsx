"use client";

/**
 * React → Solid island wrapper for the v2 Costs widget.
 *
 * Same pattern as V2ChatView's SolidChatIsland: dynamically import
 * @tmux-ide/v2-solid-widgets, mount it into a container div, return a
 * handle so we can update options without remounting on prop changes.
 */

import { useEffect, useRef } from "react";
import { resolveApiBase, resolveAuthToken } from "@/lib/appProtocol";

interface V2CostsIslandProps {
  projectName: string;
}

export function V2CostsIsland({ projectName }: V2CostsIslandProps) {
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
      handleRef.current = mod.mountCosts(el, {
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
      data-testid="v2-costs-island"
      data-session-name={projectName}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}
