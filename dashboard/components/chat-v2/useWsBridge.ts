/**
 * Subscribes the chat-v2 zustand store to the dashboard WS bus and feeds
 * incoming `chat.<aggregate>.<verb>` frames into `applyEvent`. Mounted
 * once at the chat-v2 root; unmounting releases the subscription.
 *
 * We use the existing `subscribeSession` helper from dashboard/lib/wsBus
 * so the WS connection is shared with the rest of the dashboard. Frames
 * unrelated to chat-v2 are ignored.
 */

import { useEffect } from "react";
import { subscribeSession, type ServerFrame } from "@/lib/wsBus";
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
  const applyEvent = useChatStore((s) => s.applyEvent);

  useEffect(() => {
    const release = subscribeSession(sessionName, (frame: ServerFrame) => {
      if (T3_CHAT_EVENT_TYPES.has(frame.type)) {
        applyEvent(frame as unknown as ChatBusEvent);
      }
    });
    return release;
  }, [sessionName, applyEvent]);
}
