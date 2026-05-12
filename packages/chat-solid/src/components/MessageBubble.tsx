import { createMemo, For, Show, type Accessor } from "solid-js";
import { renderMarkdown } from "../lib/markdown";
import type { ChatMessage, ContentBlock } from "../types";
import { ContentBlockView, ToolCallCard } from "./ToolCallCard";

export function MessageBubble(props: { message: ChatMessage; providerName: Accessor<string> }) {
  if (props.message.role === "user") {
    return (
      <article class="ml-auto max-w-[82%] rounded-md border border-border-weak bg-surface px-3 py-2">
        <div class="mb-1.5 flex items-center gap-1.5 text-[11px] text-dim">You</div>
        <For each={props.message.content}>{(block) => <UserContentBlockView block={block} />}</For>
      </article>
    );
  }

  const message = () => props.message as Extract<ChatMessage, { role: "assistant" }>;
  const renderedText = createMemo(() => renderMarkdown(message().text));
  const hasText = () => message().text.length > 0;
  const hasThought = () => Boolean(message().thoughtText && message().thoughtText!.length > 0);
  const hasTools = () => message().toolCalls.length > 0;

  return (
    <article class="mr-auto max-w-[88%] rounded-md border border-border-weak bg-surface px-3 py-2">
      <div class="mb-1.5 flex items-center gap-1.5 text-[11px] text-dim">
        <span>{props.providerName()}</span>
        <Show when={message().stopReason}>
          {(reason) => (
            <span class="inline-flex items-center rounded-md border border-border-weak px-1.5 py-0.5 text-[11px] text-dim">
              {reason().replaceAll("_", " ")}
            </span>
          )}
        </Show>
      </div>
      <Show when={hasText()}>
        <div>
          <div
            class="chat-solid-markdown text-[13px] leading-relaxed text-fg"
            innerHTML={renderedText()}
          />
          <Show when={message().streaming}>
            <span class="chat-solid-caret ml-1" />
          </Show>
        </div>
      </Show>
      <Show when={!hasText() && message().streaming && !hasThought() && !hasTools()}>
        <span class="text-[12px] text-dim">Starting response...</span>
      </Show>
      <Show when={hasThought()}>
        <details class="mt-2 rounded-md border border-border-weak bg-bg">
          <summary class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] text-fg-secondary">
            Thought
          </summary>
          <div class="border-t border-border-weak px-2.5 py-2 text-[12px] leading-relaxed text-fg-secondary whitespace-pre-wrap break-words">
            {message().thoughtText}
          </div>
        </details>
      </Show>
      <For each={message().toolCalls}>{(toolCall) => <ToolCallCard toolCall={toolCall} />}</For>
      <Show when={!hasText() && !hasThought() && !hasTools() && !message().streaming}>
        <span class="text-[12px] text-dim">No assistant output.</span>
      </Show>
    </article>
  );
}

function UserContentBlockView(props: { block: ContentBlock }) {
  if (props.block.type !== "text") return <ContentBlockView block={props.block} />;
  const block = props.block;
  const renderedText = createMemo(() => renderMarkdown(block.text));
  return (
    <div
      class="chat-solid-markdown text-[13px] leading-relaxed text-fg"
      innerHTML={renderedText()}
    />
  );
}
