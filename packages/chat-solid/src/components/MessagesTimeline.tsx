import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { deriveChangedFiles } from "../lib/changedFiles";
import type { MarkdownFileLinkMeta, MessagesTimelineRow, ThreadMessage } from "../types";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { MessageBubble } from "./MessageBubble";
import { PlanCard } from "./PlanCard";
import { WorkingIndicator } from "./WorkingIndicator";

export function MessagesTimeline(props: {
  rows: Accessor<MessagesTimelineRow[]>;
  messages: Accessor<ThreadMessage[]>;
  providerName: Accessor<string>;
  /** Project dir used by the markdown renderer to resolve relative file links. */
  cwd?: Accessor<string | undefined>;
  /** Fired when the user clicks a markdown file link rendered inside a message. */
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
  onSendPlanRequest?: (markdown: string) => void;
}) {
  const [container, setContainer] = createSignal<HTMLElement>();
  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  const changedFiles = createMemo(() => deriveChangedFiles(props.messages()));
  const followSignal = createMemo(() => props.rows().map(rowSignature).join("|"));
  useAutoScroll(container, sentinel, followSignal);

  return (
    <Show
      when={props.rows().length > 0}
      fallback={
        <div class="flex min-h-0 flex-1 items-center justify-center text-[13px] text-dim">
          Send a message to start this chat.
        </div>
      }
    >
      <div ref={setContainer} class="min-h-0 flex-1 overflow-auto bg-bg">
        <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5">
          <ChangedFilesTree files={changedFiles} />
          <For each={props.rows()}>
            {(row) => (
              <TimelineRow
                row={row}
                providerName={props.providerName}
                cwd={props.cwd}
                onOpenFile={props.onOpenFile}
                onSendPlanRequest={props.onSendPlanRequest}
              />
            )}
          </For>
          <div ref={setSentinel} />
        </div>
      </div>
    </Show>
  );
}

function TimelineRow(props: {
  row: MessagesTimelineRow;
  providerName: Accessor<string>;
  cwd?: Accessor<string | undefined>;
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
  onSendPlanRequest?: (markdown: string) => void;
}) {
  if (props.row.kind === "message")
    return (
      <MessageBubble
        message={props.row.message}
        providerName={props.providerName}
        cwd={props.cwd}
        onOpenFile={props.onOpenFile}
      />
    );
  if (props.row.kind === "plan")
    return <PlanCard entries={props.row.entries} onSendPlanRequest={props.onSendPlanRequest} />;
  return <WorkingIndicator />;
}

function rowSignature(row: MessagesTimelineRow): string {
  if (row.kind === "working") return `${row.id}:working`;
  if (row.kind === "plan") {
    return `${row.id}:plan:${row.entries.map((entry) => `${entry.content}:${entry.status}`).join(",")}`;
  }
  if (row.message.role === "user") return `${row.id}:user:${row.message.content.length}`;
  return `${row.id}:assistant:${row.message.text.length}:${row.message.thoughtText?.length ?? 0}:${row.message.toolCalls.map((toolCall) => `${toolCall.toolCallId}:${toolCall.status}:${toolCall.content.length}`).join(",")}:${row.message.streaming}`;
}
