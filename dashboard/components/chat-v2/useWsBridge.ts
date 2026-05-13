/**
 * Subscribes the chat-v2 zustand store to the dashboard WS bus and
 * forwards `chat.activity.appended` frames into `applyEvent`. Mounted
 * once at the chat-v2 root; unmounting releases the subscription.
 *
 * Post-migration scope: the store only tracks `unreadByThread` /
 * `lastSeqByThread`, so this bridge only needs the one frame type
 * that affects those branches. The other `chat.*` frames (turn /
 * checkpoint / plan / revert) are owned by chat-solid — feeding them
 * to the React store would be pure overhead.
 *
 * Uses `subscribeGlobal` — NOT `subscribeSession` — because chat
 * frames carry `threadId`, not `sessionName`. `dispatchFrame` in
 * wsBus.ts short-circuits to global-only when no `sessionName` is
 * present (see wsBus.ts:155), so a per-session subscription never
 * receives any chat event.
 *
 * The `sessionName` arg is retained for API stability with callers
 * (ChatV2Root) but isn't used for routing.
 */

import { useEffect } from "react";
import { subscribeGlobal, type ServerFrame } from "@/lib/wsBus";
import type { ChatBusEvent } from "./types";
import { useChatStore } from "./useChatStore";

export function useChatV2WsBridge(sessionName: string): void {
  // sessionName is intentionally unused — see the file header. Listed in
  // the signature so this hook can grow into a session-scoped filter
  // later (e.g. multi-project chat surfaces) without a call-site churn.
  void sessionName;
  const applyEvent = useChatStore((s) => s.applyEvent);

  useEffect(() => {
    const release = subscribeGlobal((frame: ServerFrame) => {
      // `chat.*` frames aren't in the typed ServerFrame union (the
      // wsBus.ts schema covers session-level frames). Compare as
      // string and cast on dispatch.
      if ((frame.type as string) === "chat.activity.appended") {
        applyEvent(frame as unknown as ChatBusEvent);
      }
    });
    return release;
  }, [applyEvent]);
}
