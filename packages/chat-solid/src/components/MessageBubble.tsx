import { createMemo, For, Show, type Accessor } from "solid-js";
import { renderMarkdown } from "../lib/markdown";
import { resolveMarkdownFileLinkMeta } from "../lib/markdownLinks";
import type { ChatMessage, ContentBlock, MarkdownFileLinkMeta } from "../types";
import { ContentBlockView, ToolCallCard } from "./ToolCallCard";

/**
 * Renders a single chat message — user prompt or assistant reply. Visual
 * language is ported from t3code's MessagesTimeline:
 *
 *   User    →  right-aligned bubble, max-w 80%, rounded-2xl with the
 *              bottom-right corner tightened (`rounded-br-sm`) so the
 *              bubble points back to "You". Border + subtle bg
 *              (`--surface`). Timestamp pinned to the lower-right;
 *              actions (copy, revert) reveal on hover via the
 *              `group/user` parent.
 *
 *   Assist. →  full-width, no bubble chrome. Thin meta line at the top
 *              (provider name + stop-reason chip + timestamp).
 *              `chat-solid-markdown` body renders directly on the
 *              thread background. Thought (collapsed details) and tool
 *              calls cascade below.
 *
 * All colors are design-token-driven (`--accent`, `--border`,
 * `--surface`, `--fg`, `--dim`, …). PR 4 introduced `.chat-markdown`
 * (the alias we read here) for consistent link/code/list rules; this
 * file stays neutral so theme switches cascade.
 */

const TIMESTAMP_FMT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, TIMESTAMP_FMT);
}

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
    return <UserMessageRow {...props} message={props.message} />;
  }
  return (
    <AssistantMessageRow
      message={props.message as Extract<ChatMessage, { role: "assistant" }>}
      providerName={props.providerName}
      cwd={props.cwd}
      onOpenFile={props.onOpenFile}
    />
  );
}

function UserMessageRow(props: {
  message: Extract<ChatMessage, { role: "user" }>;
  cwd?: Accessor<string | undefined>;
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
}) {
  const timestamp = createMemo(() => formatTimestamp(props.message.createdAt));
  return (
    <div data-testid="message-row" data-role="user" class="flex justify-end">
      <article
        class="group/user relative max-w-[80%] rounded-2xl rounded-br-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
      >
        <For each={props.message.content}>
          {(block) => (
            <UserContentBlockView block={block} cwd={props.cwd} onOpenFile={props.onOpenFile} />
          )}
        </For>
        <Show when={timestamp()}>
          {(ts) => (
            <p
              data-testid="message-timestamp"
              class="mt-1.5 text-right text-[11px] text-[var(--dim)] tabular-nums"
            >
              {ts()}
            </p>
          )}
        </Show>
      </article>
    </div>
  );
}

function AssistantMessageRow(props: {
  message: Extract<ChatMessage, { role: "assistant" }>;
  providerName: Accessor<string>;
  cwd?: Accessor<string | undefined>;
  onOpenFile?: (meta: MarkdownFileLinkMeta) => void;
}) {
  const renderedText = createMemo(() =>
    renderMarkdown(props.message.text, { cwd: props.cwd?.() }),
  );
  const hasText = () => props.message.text.length > 0;
  const hasThought = () =>
    Boolean(props.message.thoughtText && props.message.thoughtText.length > 0);
  const hasTools = () => props.message.toolCalls.length > 0;
  const timestamp = createMemo(() =>
    formatTimestamp(props.message.completedAt ?? props.message.createdAt),
  );

  return (
    <article
      data-testid="message-row"
      data-role="assistant"
      data-streaming={props.message.streaming ? "true" : "false"}
      class="group/assistant min-w-0 px-1 py-0.5"
    >
      {/* Meta strip — provider + stop-reason chip + timestamp */}
      <header class="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--dim)]">
        <span class="font-medium text-[var(--fg-secondary)]">{props.providerName()}</span>
        <Show when={props.message.stopReason}>
          {(reason) => (
            <span
              data-testid="message-stop-reason"
              class="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-strong)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]"
            >
              {reason().replaceAll("_", " ")}
            </span>
          )}
        </Show>
        <span class="flex-1" />
        <Show when={timestamp()}>
          {(ts) => (
            <span
              data-testid="message-timestamp"
              class="text-[10px] tabular-nums text-[var(--dimmer)]"
            >
              {ts()}
            </span>
          )}
        </Show>
      </header>

      <Show when={hasText()}>
        <div class="min-w-0">
          <div
            class="chat-solid-markdown chat-markdown text-[13px] leading-relaxed text-[var(--fg)]"
            innerHTML={renderedText()}
            onClick={(event) => handleFileLinkClick(event, props.cwd?.(), props.onOpenFile)}
          />
          <Show when={props.message.streaming}>
            <span class="chat-solid-caret ml-1" />
          </Show>
        </div>
      </Show>

      <Show when={!hasText() && props.message.streaming && !hasThought() && !hasTools()}>
        <WorkingDots />
      </Show>

      <Show when={hasThought()}>
        <details
          data-testid="message-thought"
          class="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-weak)]"
        >
          <summary class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--dim)]">
            <span aria-hidden="true">▸</span>
            <span>Thought</span>
          </summary>
          <div class="border-t border-[var(--border)] px-3 py-2 text-[12px] leading-relaxed text-[var(--fg-secondary)] whitespace-pre-wrap break-words">
            {props.message.thoughtText}
          </div>
        </details>
      </Show>

      <For each={props.message.toolCalls}>{(toolCall) => <ToolCallCard toolCall={toolCall} />}</For>

      <Show when={!hasText() && !hasThought() && !hasTools() && !props.message.streaming}>
        <span data-testid="message-empty" class="text-[12px] text-[var(--dim)]">
          No assistant output.
        </span>
      </Show>
    </article>
  );
}

function WorkingDots() {
  return (
    <div
      data-testid="message-working"
      class="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--dim)]"
    >
      <span class="h-1 w-1 rounded-full bg-[var(--dim)] animate-pulse" />
      <span class="h-1 w-1 rounded-full bg-[var(--dim)] animate-pulse [animation-delay:200ms]" />
      <span class="h-1 w-1 rounded-full bg-[var(--dim)] animate-pulse [animation-delay:400ms]" />
    </div>
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
      class="chat-solid-markdown chat-markdown text-[13px] leading-relaxed text-[var(--fg)]"
      innerHTML={renderedText()}
      onClick={(event) => handleFileLinkClick(event, props.cwd?.(), props.onOpenFile)}
    />
  );
}
