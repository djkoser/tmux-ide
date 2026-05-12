"use client";

/**
 * V2ChatView — v2 chat surface.
 *
 * Hybrid by design: the React shell (thread rail, header, error banner)
 * owns thread CRUD via dashboard/lib/api.ts; the per-thread experience
 * is the Solid `@tmux-ide/chat-solid` ChatThreadView mounted as an island.
 * That keeps the rich chat functionality (tool calls, permission dialogs,
 * attachments, command menu, plan cards, streaming) without porting
 * 3,022 LOC of Solid to React.
 *
 * Pattern mirrors components/chat/ChatTabPanel.tsx but adds the v2
 * thread rail + chrome around it.
 */

import { useEffect, useRef, useState } from "react";
import {
  chatProvidersList,
  chatSessionSend,
  chatThreadCreate,
  chatThreadDelete,
  chatThreadList,
  type ProviderInfo,
} from "@/lib/api";
import type { AgentProvider, ThreadIndexEntry } from "@/components/chat/types";
import { ChatV2Root } from "@/components/chat-v2";
import { resolveApiBase, resolveAuthToken, withWsBase } from "@/lib/appProtocol";
import { subscribeSession, type ServerFrame } from "@/lib/wsBus";
import {
  CHAT_V1_BANNER_TEXT,
  resolveChatVersionFromBrowser,
  type ChatVersion,
} from "@/lib/chatVersion";

interface V2ChatViewProps {
  projectName: string;
  /**
   * Explicit chat version override — bypasses URL/localStorage detection.
   * Used by tests; production code lets the page detect at mount.
   */
  chatVersionOverride?: ChatVersion;
}

export function V2ChatView({ projectName, chatVersionOverride }: V2ChatViewProps) {
  const [threads, setThreads] = useState<ThreadIndexEntry[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const chatVersion: ChatVersion = chatVersionOverride ?? resolveChatVersionFromBrowser();

  // Initial load: threads + providers
  useEffect(() => {
    let active = true;
    chatThreadList()
      .then((res) => {
        if (!active) return;
        setThreads(res.threads);
        if (res.threads.length > 0) {
          setActiveThreadId((current) => current ?? res.threads[0].id);
        }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    chatProvidersList()
      .then((res) => active && setProviders(res.providers))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // WebSocket: react to chat.thread.index pushes (server tells us when the
  // index changes — e.g. another client created/deleted/renamed a thread).
  useEffect(() => {
    const release = subscribeSession(projectName, (frame: ServerFrame) => {
      if (frame.type === "chat.thread.index") {
        setThreads(frame.threads);
      }
    });
    return release;
  }, [projectName]);

  async function handleNewThread() {
    if (providers.length === 0) {
      setError("No chat providers available");
      return;
    }
    try {
      const provider: AgentProvider = { kind: providers[0].kind };
      const res = await chatThreadCreate({ provider, title: "New chat" });
      setThreads((prev) => [res.thread, ...prev]);
      setActiveThreadId(res.thread.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: string) {
    try {
      await chatThreadDelete({ id });
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) setActiveThreadId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (chatVersion === "v2") {
    return (
      <div
        data-testid="v2-chat-view-chat-v2"
        data-chat-version="v2"
        className="flex h-full min-h-0 flex-col"
      >
        {error && (
          <div className="border-b border-[var(--red)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--red)]">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-[var(--dim)] hover:text-[var(--fg)]"
            >
              ×
            </button>
          </div>
        )}
        <ChatV2Root
          projectName={projectName}
          threads={threads}
          activeThreadId={activeThreadId}
          onPickThread={setActiveThreadId}
          onNewThread={handleNewThread}
          onDeleteThread={handleDelete}
          onSend={(threadId, text) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            chatSessionSend({ threadId, text: trimmed }).catch((e) =>
              setError(e instanceof Error ? e.message : String(e)),
            );
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="v2-chat-view-chat-v1"
      data-chat-version="v1"
      className="flex h-full min-h-0 flex-col text-[12px]"
    >
      <div
        data-testid="chat-v1-deprecation-banner"
        role="status"
        className="border-b border-[var(--yellow)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--yellow)]"
      >
        {CHAT_V1_BANNER_TEXT}
      </div>
      <div className="flex min-h-0 flex-1 flex-row">
        <ThreadRail
          threads={threads}
          activeId={activeThreadId}
          onPick={setActiveThreadId}
          onNew={handleNewThread}
          onDelete={handleDelete}
        />

        <div className="flex flex-1 min-w-0 flex-col">
          {error && (
            <div className="border-b border-[var(--red)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--red)]">
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 text-[var(--dim)] hover:text-[var(--fg)]"
              >
                ×
              </button>
            </div>
          )}

          {activeThreadId ? (
            <SolidChatIsland sessionName={projectName} threadId={activeThreadId} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--dim)]">
              — pick or create a thread —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Solid island: mounts @tmux-ide/chat-solid's ChatThreadView for the
// selected thread. Everything inside this <div> is owned by Solid:
// tool-call cards, permission dialogs, attachment pickers, slash menus,
// plan cards, streaming message rendering. We just give it a container.

function SolidChatIsland({ sessionName, threadId }: { sessionName: string; threadId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<{
    unmount(): void;
    setThreadId(id: string): void;
  } | null>(null);

  // Mount once per (sessionName); update threadId via the handle's setter
  // so we don't tear down/remount on thread switches.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/chat-solid");
      if (cancelled) return;
      handleRef.current = mod.mount(el, {
        threadId,
        sessionName,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionName]);

  // Re-target the thread without unmounting
  useEffect(() => {
    handleRef.current?.setThreadId(threadId);
  }, [threadId]);

  return (
    <div
      ref={containerRef}
      data-testid="v2-chat-solid-island"
      data-session-name={sessionName}
      data-thread-id={threadId}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────
// React-owned thread rail — list, new, delete. Stays in React so v2 chrome
// (active border accents, hover states, monospace) feels native.

function ThreadRail({
  threads,
  activeId,
  onPick,
  onNew,
  onDelete,
}: {
  threads: ThreadIndexEntry[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-[var(--border)]">
      <header className="flex h-7 items-center justify-between border-b border-[var(--border-weak)] px-3 text-[10px] uppercase tracking-wider text-[var(--dim)]">
        <span>threads</span>
        <button
          onClick={onNew}
          className="text-[var(--accent)] hover:text-[var(--fg)]"
          title="New chat"
        >
          +
        </button>
      </header>
      <ul className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <li className="px-3 py-2 text-[11px] text-[var(--dim)]">— no threads —</li>
        ) : (
          threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className="group relative">
                <button
                  onClick={() => onPick(t.id)}
                  className="flex w-full flex-col px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
                  style={{
                    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    color: active ? "var(--accent)" : "var(--fg)",
                  }}
                >
                  <span className="truncate">{t.title || "untitled"}</span>
                  <span className="text-[10px] text-[var(--dim)]">
                    {t.providerKind} · {t.messageCount} msg
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t.id);
                  }}
                  className="absolute right-2 top-1.5 text-[var(--dim)] opacity-0 transition-opacity hover:text-[var(--red)] group-hover:opacity-100"
                  title="Delete thread"
                >
                  ×
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
