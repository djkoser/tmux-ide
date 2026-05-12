"use client";

import { useEffect, useRef } from "react";
import { resolveApiBase, resolveAuthToken, withWsBase } from "@/lib/appProtocol";

interface ChatTabPanelProps {
  sessionName: string;
  threadId: string;
}

export function ChatTabPanel({ sessionName, threadId }: ChatTabPanelProps) {
  return (
    <div
      ref={useSolidChatIsland({ sessionName, threadId })}
      data-testid="chat-tab-panel"
      data-session-name={sessionName}
      data-thread-id={threadId}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}

function useSolidChatIsland({
  sessionName,
  threadId,
}: ChatTabPanelProps): (node: HTMLDivElement | null) => void {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<{ unmount(): void; setThreadId(id: string): void } | null>(null);
  const latestPropsRef = useRef({ sessionName, threadId });
  latestPropsRef.current = { sessionName, threadId };

  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    let cancelled = false;

    void (async () => {
      const mod = await import("@tmux-ide/chat-solid");
      if (cancelled) return;
      const latest = latestPropsRef.current;
      handleRef.current = mod.mount(el, {
        threadId: latest.threadId,
        sessionName: latest.sessionName,
        apiBaseUrl: resolveApiBase(),
        wsUrl: withWsBase("/ws/events"),
        bearerToken: resolveAuthToken(),
      });
    })();

    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
  }, [sessionName]);

  useEffect(() => {
    handleRef.current?.setThreadId(threadId);
  }, [threadId]);

  return (node) => {
    nodeRef.current = node;
  };
}
