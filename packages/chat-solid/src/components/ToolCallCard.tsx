import { For, Show } from "solid-js";
import type { ContentBlock, ToolCallContent, ToolCallView } from "../types";

export function ToolCallCard(props: { toolCall: ToolCallView }) {
  return (
    <details class="mt-2 rounded-md border border-border-weak bg-bg">
      <summary class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] text-fg-secondary">
        <span>▸</span>
        <strong class="min-w-0 flex-1 truncate text-fg">{props.toolCall.title}</strong>
        <Show when={props.toolCall.kind}>
          {(kind) => <span class="text-[11px] text-dim">{kind()}</span>}
        </Show>
        <span class="rounded border border-border px-1.5 py-0.5 text-[10px] text-dim">
          {props.toolCall.status.replace("_", " ")}
        </span>
      </summary>
      <div class="border-t border-border-weak px-2.5 py-2 text-[12px] text-fg-secondary whitespace-pre-wrap break-words">
        <Show
          when={props.toolCall.content.length > 0}
          fallback={<div class="text-dim">No tool output yet.</div>}
        >
          <For each={props.toolCall.content}>{(content) => <ToolContent content={content} />}</For>
        </Show>
      </div>
    </details>
  );
}

function ToolContent(props: { content: ToolCallContent }) {
  if (props.content.type === "content") return <ContentBlockView block={props.content.content} />;
  if (props.content.type === "diff") return <div>Diff: {props.content.path}</div>;
  return <div>Terminal: {props.content.terminalId}</div>;
}

export function ContentBlockView(props: { block: ContentBlock }) {
  switch (props.block.type) {
    case "text":
      return (
        <p class="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">
          {props.block.text}
        </p>
      );
    case "image":
      return <p class="text-[12px] text-dim">Image attachment ({props.block.mimeType})</p>;
    case "audio":
      return <p class="text-[12px] text-dim">Audio attachment ({props.block.mimeType})</p>;
    case "resource":
      return (
        <p class="text-[12px] text-dim">{props.block.resource.text ?? props.block.resource.uri}</p>
      );
    case "resource_link":
      return (
        <a href={props.block.uri} class="text-accent hover:underline">
          {props.block.name ?? props.block.uri}
        </a>
      );
  }
}
