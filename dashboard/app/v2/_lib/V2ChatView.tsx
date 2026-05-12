"use client";

/**
 * V2ChatView — v2 chat surface.
 *
 * Thin shell around `ChatV2Root` (the canonical t3-style chat stack
 * since T080). Owns thread CRUD via dashboard/lib/api.ts and lets
 * `ChatV2Root` handle the per-thread experience: thread list rail,
 * turn stream, plan/checkpoint/permission panels, composer.
 *
 * Chat v1 + its `?chat=v1` URL escape and `tmux-ide:use-old-chat`
 * localStorage hatch retired in U3 (docs/unify-audit.md §U3).
 * The legacy components that used to live here:
 *   - inline ThreadRail (subsumed by chat-v2's ThreadListRail)
 *   - SolidChatIsland mount for `@tmux-ide/chat-solid` (replaced by
 *     ChatV2Root's native rendering)
 *   - resolveChatVersionFromBrowser / CHAT_V1_BANNER_TEXT branches
 * …are gone with this commit.
 */

import { useEffect, useMemo, useState } from "react";
import {
  chatProvidersList,
  chatSessionSend,
  chatThreadCreate,
  chatThreadDelete,
  chatThreadList,
} from "@/lib/api";
import { bootstrapPrefetchFromList } from "@/lib/threadPrefetch";
import {
  fetchProjectFiles,
  type ProjectFileNode,
  type ProviderInfo,
} from "@/lib/api";
import type { MentionCandidate } from "@tmux-ide/chat-solid";
import type { AgentProvider, ThreadIndexEntry } from "@/components/chat-v2/types";
import { ChatV2Root } from "@/components/chat-v2";
import { useSessionStream } from "@/lib/useSessionStream";
import { subscribeSession, type ServerFrame } from "@/lib/wsBus";

interface V2ChatViewProps {
  projectName: string;
}

export function V2ChatView({ projectName }: V2ChatViewProps) {
  const [threads, setThreads] = useState<ThreadIndexEntry[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFileNode[]>([]);
  const { snapshot } = useSessionStream(projectName);

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
        // Eagerly warm the top-N most-recently-updated threads so thread
        // switches render instantly (cache hit) instead of waiting on a
        // /api/threads/:id round-trip. See dashboard/lib/threadPrefetch.ts.
        void bootstrapPrefetchFromList(res.threads);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    chatProvidersList()
      .then((res) => active && setProviders(res.providers))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // One-shot fetch of the project file tree for the @-mention menu. The
  // tree is large; we don't re-fetch on every keystroke — only when the
  // project changes. A future PR can subscribe to file-tree changes via
  // the WS bus (`fs.changed` frames don't exist yet — that's the gate).
  useEffect(() => {
    if (!projectName || projectName === "__fallback") {
      setFiles([]);
      return;
    }
    let cancelled = false;
    fetchProjectFiles(projectName)
      .then((tree) => {
        if (!cancelled) setFiles(tree);
      })
      .catch(() => {
        // Mention menu degrades gracefully when files are unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [projectName]);

  // Compose mention candidates: files (flattened) + sibling threads +
  // active agent panes + project skills. Pure derived state — memoized
  // so the chat-v2 composer doesn't re-render on every snapshot tick.
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const out: MentionCandidate[] = [];
    flattenFileNodes(files, out);
    for (const t of threads) {
      out.push({
        kind: "thread",
        value: t.id,
        label: t.title || "untitled",
        hint: `${t.providerKind} · ${t.messageCount} msgs`,
      });
    }
    for (const agent of snapshot?.agents ?? []) {
      out.push({
        kind: "agent",
        value: agent.paneId,
        label: agent.paneTitle,
        hint: agent.isBusy ? "busy" : "idle",
      });
    }
    for (const skill of snapshot?.skills ?? []) {
      out.push({
        kind: "agent",
        value: `skill:${skill.name}`,
        label: `skill: ${skill.name}`,
        hint: skill.role || skill.specialties?.join(", ") || undefined,
      });
    }
    return out;
  }, [files, threads, snapshot?.agents, snapshot?.skills]);

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
        mentionCandidates={mentionCandidates}
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

/**
 * Depth-first walk of the project file tree. Only emits non-directory
 * leaves (mentioning a folder isn't useful). The label is the path
 * relative to the project root; the value matches so `@<path>` lands
 * verbatim in the prompt.
 */
function flattenFileNodes(nodes: ReadonlyArray<ProjectFileNode>, out: MentionCandidate[]): void {
  for (const node of nodes) {
    if (node.isDirectory) {
      if (node.children) flattenFileNodes(node.children, out);
      continue;
    }
    out.push({ kind: "file", value: node.path, label: node.path });
  }
}
