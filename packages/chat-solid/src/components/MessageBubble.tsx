import { createMemo, For, Show, type Accessor } from "solid-js";
import { renderMarkdown } from "../lib/markdown";
import { resolveMarkdownFileLinkMeta } from "../lib/markdownLinks";
import type { ChatMessage, ContentBlock, MarkdownFileLinkMeta } from "../types";
import { ContentBlockView, ToolCallCard } from "./ToolCallCard";

/**
 * Click-delegation handler attached to any rendered markdown container.
 * Walks up from the event target until it finds a `.chat-file-link`,
 * extracts the data attributes the renderer wrote in, and forwards a
 * structured `MarkdownFileLinkMeta` to the host callback. Falls back to
 * re-deriving the meta from the href (in case attributes were stripped).
 */
function handleFileLinkClick(
  event: MouseEvent,
  cwd: string | undefined,
  onOpenFile: ((meta: MarkdownFileLinkMeta) => void) | undefined,
) {
  if (!onOpenFile) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const anchor = target.closest<HTMLAnchorElement>("a.chat-file-link");
  if (!anchor) return;
  event.preventDefault();
  const filePath = anchor.dataset.filePath ?? anchor.getAttribute("href") ?? "";
  const lineRaw = anchor.dataset.fileLine;
  const colRaw = anchor.dataset.fileColumn;
  const line = lineRaw ? Number.parseInt(lineRaw, 10) : Number.NaN;
  const column = colRaw ? Number.parseInt(colRaw, 10) : Number.NaN;
  const meta =
    resolveMarkdownFileLinkMeta(anchor.getAttribute("href") ?? undefined, cwd) ??
    ({
      filePath,
      targetPath: filePath,
      displayPath: filePath,
      basename: filePath.slice(filePath.lastIndexOf("/") + 1),
      ...(Number.isFinite(line) ? { line } : {}),
      ...(Number.isFinite(column) ? { column } : {}),
    } as MarkdownFileLinkMeta);
  onOpenFile(meta);
}

export function MessageBubble(props: {
  message: ChatMessage;
  providerName: Accessor<string>;
  cwd?: Accessor<string | undefined>;
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
}) {
  if (props.message.role === "user") {
    return (
      <article class="ml-auto max-w-[82%] rounded-md border border-border-weak bg-surface px-3 py-2">
        <div class="mb-1.5 flex items-center gap-1.5 text-[11px] text-dim">You</div>
        <For each={props.message.content}>
          {(block) => (
            <UserContentBlockView block={block} cwd={props.cwd} onOpenFile={props.onOpenFile} />
          )}
        </For>
      </article>
    );
  }

  const message = () => props.message as Extract<ChatMessage, { role: "assistant" }>;
  const renderedText = createMemo(() =>
    renderMarkdown(message().text, { cwd: props.cwd?.() }),
  );
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
            onClick={(event) => handleFileLinkClick(event, props.cwd?.(), props.onOpenFile)}
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

function UserContentBlockView(props: {
  block: ContentBlock;
  cwd?: Accessor<string | undefined>;
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
}) {
  if (props.block.type !== "text") return <ContentBlockView block={props.block} />;
  const block = props.block;
  const renderedText = createMemo(() => renderMarkdown(block.text, { cwd: props.cwd?.() }));
  return (
    <div
      class="chat-solid-markdown text-[13px] leading-relaxed text-fg"
      innerHTML={renderedText()}
      onClick={(event) => handleFileLinkClick(event, props.cwd?.(), props.onOpenFile)}
    />
  );
}
