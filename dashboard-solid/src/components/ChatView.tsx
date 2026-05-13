/**
 * ChatView — Solid-native host for `@tmux-ide/chat-solid`.
 *
 * In the React app this is `dashboard/app/v2/_lib/V2ChatView.tsx` plus
 * the `ChatV2Root` shell + the chat-solid bridge. None of that is
 * needed in the Solid app: the route is already Solid, so we can call
 * chat-solid's `mount()` directly against a div ref.
 *
 * G16-P2 scope: render an empty thread for the current project — no
 * thread list rail (that lands in P3 alongside the broader chat
 * surface). The user lands on the empty-state, can interact with the
 * composer to create a thread once the daemon's `/api/threads`
 * endpoint is reachable.
 */

import { onCleanup, onMount } from "solid-js";
import { mount, type ChatHandle } from "@tmux-ide/chat-solid";
import { API_BASE } from "@/lib/api";
import { resolveAuthToken, withWsBase } from "@/lib/appProtocol";

interface ChatViewProps {
  projectName: string;
  /**
   * Optional thread id. When omitted the chat-solid surface renders
   * its empty state and the host wires thread creation via the
   * composer's send action. The G16-P3 ChatRail will set this.
   */
  threadId?: string;
}

export function ChatView(props: ChatViewProps) {
  let container!: HTMLDivElement;
  let handle: ChatHandle | null = null;

  onMount(() => {
    handle = mount(container, {
      threadId: props.threadId ?? "",
      sessionName: props.projectName,
      apiBaseUrl: API_BASE,
      wsUrl: withWsBase("/ws"),
      bearerToken: resolveAuthToken(),
    });
  });

  onCleanup(() => {
    handle?.unmount();
    handle = null;
  });

  return (
    <div
      ref={container}
      data-testid="v2-chat-view"
      class="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
    />
  );
}
