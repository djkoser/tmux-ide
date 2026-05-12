/**
 * Subscribes the chat-v2 zustand store to the dashboard WS bus and feeds
 * incoming `chat.<aggregate>.<verb>` frames into `applyEvent`. Mounted
 * once at the chat-v2 root; unmounting releases the subscription.
 *
 * Uses `subscribeGlobal` — NOT `subscribeSession` — because chat frames
 * carry `threadId`, not `sessionName`. `dispatchFrame` in wsBus.ts
 * short-circuits to global-only when no `sessionName` is present
 * (see wsBus.ts:155), so a per-session subscription never receives any
 * chat event. The store's reducers already filter by threadId
 * internally, so taking every chat frame here is correct + cheap.
 *
 * The `sessionName` arg is retained for API stability with callers
 * (ChatV2Root) but isn't used for routing.
 */

import { useEffect } from "react";
import { subscribeGlobal, type ServerFrame } from "@/lib/wsBus";
import type { ChatBusEvent } from "./types";
import { useChatStore } from "./useChatStore";

const T3_CHAT_EVENT_TYPES = new Set<string>([
  "chat.activity.appended",
  "chat.turn.started",
  "chat.turn.completed",
  "chat.turn.aborted",
  "chat.plan.upserted",
  "chat.checkpoint.created",
  "chat.thread.reverted",
]);

export function useChatV2WsBridge(sessionName: string): void {
  // sessionName is intentionally unused — see the file header. Listed in
  // the signature so this hook can grow into a session-scoped filter
  // later (e.g. multi-project chat surfaces) without a call-site churn.
  void sessionName;
  const applyEvent = useChatStore((s) => s.applyEvent);

  useEffect(() => {
    const release = subscribeGlobal((frame: ServerFrame) => {
      if (T3_CHAT_EVENT_TYPES.has(frame.type)) {
        applyEvent(frame as unknown as ChatBusEvent);
      }
    });
    return release;
  }, [applyEvent]);
}
