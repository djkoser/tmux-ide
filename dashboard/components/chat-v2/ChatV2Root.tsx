"use client";

/**
 * Chat v2 root surface. Two-pane layout:
 *
 *   - ThreadListRail (left, ~240px) — React. Picks/creates/deletes
 *     threads. Reads thread metadata + unread counts from the local
 *     zustand store; chat events still flow through useChatV2WsBridge
 *     so unread badges keep ticking even when chat-solid is the
 *     thing rendering messages.
 *   - ChatSolidBridge (right, flex) — mounts the canonical chat-solid
 *     surface (transcript + composer + header + banners) for the
 *     active thread. Send / streaming / @-mentions / file-link
 *     routing all live inside chat-solid; the React side no longer
 *     ships a duplicate message renderer.
 *
 * Per the framework-silo memory: RSC orchestrates, feature blocks
 * are siloed by framework. chat-solid IS the chat block. This file
 * is the rail + a thin host shell, nothing more.
 */

import { useEffect } from "react";
import type { MarkdownFileLinkMeta, MentionCandidate } from "@tmux-ide/chat-solid";
import { ChatSolidBridge } from "./chat-solid-bridge";
import { ThreadListRail } from "./ThreadListRail";
import type { ThreadIndexEntry } from "./types";
import { useChatStore } from "./useChatStore";
import { useChatV2WsBridge } from "./useWsBridge";

export interface ChatV2RootProps {
  projectName: string;
  threads: ThreadIndexEntry[];
  activeThreadId: string | null;
  onPickThread(id: string): void;
  onNewThread(): void;
  onDeleteThread?(id: string): void;
  /**
   * Candidates surfaced by the chat-solid composer's @-mention
   * autocomplete. Host composes files + threads + agents + skills.
   * Falsy / empty suppresses the menu without remounting.
   */
  mentionCandidates?: ReadonlyArray<MentionCandidate>;
  /** Routes a markdown file-link click to the host's preview view. */
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
  /**
   * Fired when the chat header's Close button is clicked. Host
   * typically deselects the active thread (`onPickThread(null)`
   * equivalent), which causes the right pane to drop to its empty
   * state. Omit to hide the Close affordance entirely — chat-solid's
   * header only renders the button when this is provided.
   */
  onClose?: () => void;
  /**
   * Fired when the chat header's Delete button is clicked. Host
   * owns the daemon dispatch (DELETE /api/threads/:id), the
   * thread-list reconciliation, AND any destructive-action confirm
   * prompt. Receives the active thread id. Omit to hide the Delete
   * affordance. The rail-side per-thread × stays wired independently
   * via `onDeleteThread`.
   */
  onDelete?: (threadId: string) => void;
}

export function ChatV2Root(props: ChatV2RootProps) {
  // Keep the WS bridge alive so the local store's unread counter
  // (read by ThreadListRail) ticks. Post-WN7 cleanup the bridge only
  // forwards `chat.activity.appended`; chat-solid owns everything else.
  useChatV2WsBridge(props.projectName);

  const setThreads = useChatStore((s) => s.setThreads);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const unreadByThread = useChatStore((s) => s.unreadByThread);

  useEffect(() => setThreads(props.threads), [props.threads, setThreads]);
  useEffect(() => setActiveThread(props.activeThreadId), [props.activeThreadId, setActiveThread]);

  return (
    <div
      data-testid="chat-v2-root"
      data-project={props.projectName}
      className="font-sans flex h-full min-h-0 flex-row text-[12px]"
    >
      <ThreadListRail
        threads={props.threads}
        activeId={props.activeThreadId}
        unreadByThread={unreadByThread}
        onPick={props.onPickThread}
        onNew={props.onNewThread}
        onDelete={props.onDeleteThread}
      />
      <ChatSolidBridge
        threadId={props.activeThreadId}
        sessionName={props.projectName}
        mentionCandidates={props.mentionCandidates}
        onOpenFile={props.onOpenFile}
        onClose={props.onClose}
        onDelete={props.onDelete}
      />
    </div>
  );
}
