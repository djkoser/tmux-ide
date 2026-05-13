/**
 * ChatView — Solid-native host for `@tmux-ide/chat-solid`.
 *
 * Resolves a real threadId before mounting chat-solid: lists existing
 * threads and reuses the most recent, or creates a fresh one with the
 * default provider. Mounting chat-solid with an empty threadId
 * triggers `chat.thread.get` against `id: ""`, which the daemon's Zod
 * schema rejects with `Input failed schema validation`.
 */

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { mount, type ChatHandle } from "@tmux-ide/chat-solid";
import { API_BASE } from "@/lib/api";
import { resolveAuthToken, withWsBase } from "@/lib/appProtocol";

interface ChatViewProps {
  projectName: string;
  /** Optional explicit thread id (e.g. selected from a future ChatRail). */
  threadId?: string;
}

interface ActionOkEnvelope<T> {
  ok: true;
  result: T;
}
interface ActionErrEnvelope {
  ok: false;
  error: { code: string; message: string };
}

async function postAction<T>(name: string, input: unknown): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = resolveAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/v2/action/${encodeURIComponent(name)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const body = (await res.json()) as ActionOkEnvelope<T> | ActionErrEnvelope;
  if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
  return body.result;
}

async function resolveThreadId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const { threads } = await postAction<{
    threads: Array<{ id: string; updatedAt?: string }>;
  }>("chat.thread.list", {});
  if (threads.length > 0) {
    const sorted = [...threads].sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
    return sorted[0]!.id;
  }
  const { thread } = await postAction<{ thread: { id: string } }>("chat.thread.create", {
    provider: { kind: "claude-code" },
  });
  return thread.id;
}

export function ChatView(props: ChatViewProps) {
  let container!: HTMLDivElement;
  let handle: ChatHandle | null = null;
  const [error, setError] = createSignal<string | null>(null);
  const [ready, setReady] = createSignal(false);

  onMount(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await resolveThreadId(props.threadId);
        if (cancelled) return;
        handle = mount(container, {
          threadId: id,
          sessionName: props.projectName,
          apiBaseUrl: API_BASE,
          wsUrl: withWsBase("/ws"),
          bearerToken: resolveAuthToken(),
        });
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    onCleanup(() => {
      cancelled = true;
    });
  });

  onCleanup(() => {
    handle?.unmount();
    handle = null;
  });

  return (
    <div class="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <Show when={!ready() && !error()}>
        <div class="flex h-full min-h-0 items-center justify-center text-[13px] text-[var(--fg-secondary)]">
          Loading chat…
        </div>
      </Show>
      <Show when={error()}>
        <div class="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-[var(--fg-secondary)]">
          <div class="font-medium text-[var(--fg)]">Couldn't start chat</div>
          <div class="text-[12px]">{error()}</div>
        </div>
      </Show>
      <div
        ref={container}
        data-testid="v2-chat-view"
        class="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
        style={{ display: ready() ? "flex" : "none" }}
      />
    </div>
  );
}
