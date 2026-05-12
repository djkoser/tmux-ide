import { createMemo, Show, type Accessor } from "solid-js";
import { useChatThread } from "../hooks/useChatThread";
import { providerDisplayName } from "../lib/provider";
import type { ChatMountOptions } from "../types";
import { ChatComposer } from "./ChatComposer";
import { ChatHeader } from "./ChatHeader";
import { MessagesTimeline } from "./MessagesTimeline";
import { PermissionDialog } from "./PermissionDialog";

export function ChatThreadView(props: { options: Accessor<ChatMountOptions> }) {
  const chat = useChatThread(props.options);
  const providerName = createMemo(() => providerDisplayName(chat.thread()?.provider));

  return (
    <div class="absolute inset-0 flex min-h-0 flex-col bg-bg">
      <Show
        when={!chat.loading()}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center text-[13px] text-dim">
            Loading chat...
          </div>
        }
      >
        <Show
          when={chat.thread()}
          fallback={
            <div class="p-5 text-[13px] text-red">
              {chat.error()?.message ??
                "This chat thread does not exist or is no longer available."}
            </div>
          }
        >
          <ChatHeader
            thread={chat.thread}
            inflight={chat.inflight}
            stopReason={chat.stopReason}
            usage={chat.usage}
            sessionName={() => props.options().sessionName}
            onCancel={() => void chat.cancel()}
            onRename={chat.rename}
            onClose={props.options().onClose}
          />
          <MessagesTimeline
            rows={chat.rows}
            messages={chat.messages}
            providerName={providerName}
            onSendPlanRequest={chat.prefillPrompt}
          />
          <ChatComposer
            disabled={chat.inflight}
            availableCommands={chat.availableCommands}
            providerName={providerName}
            sessionName={() => props.options().sessionName}
            projectDir={() => chat.thread()?.projectDir}
            attachments={chat.attachments}
            terminalPanes={chat.terminalPanes}
            prefillPromptText={chat.prefillPromptText}
            threadId={() => props.options().threadId}
            mentionCandidates={() => props.options().mentionCandidates ?? []}
            onPrefillPromptConsumed={() => chat.prefillPrompt(null)}
            onAddAttachment={chat.addAttachment}
            onRemoveAttachment={chat.removeAttachment}
            onSend={chat.send}
            onCancel={chat.cancel}
          />
          <PermissionDialog pending={chat.pendingPermission} onRespond={chat.respondToPermission} />
        </Show>
      </Show>
    </div>
  );
}
