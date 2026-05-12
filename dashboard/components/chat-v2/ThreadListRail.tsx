/**
 * Left rail — list of threads keyed by id. Click selects the thread;
 * the unread dot fades once the thread becomes active.
 *
 * Virtualization: we lean on the browser's native overflow scroll for
 * now (chat threads top out in the low hundreds). A windowed
 * implementation can replace this when we cross 1k threads — keep the
 * keyed list shape so it's a drop-in upgrade.
 */

import type { ThreadIndexEntry } from "../chat/types";

export interface ThreadListRailProps {
  threads: ThreadIndexEntry[];
  activeId: string | null;
  unreadByThread: Record<string, number>;
  onPick(id: string): void;
  onNew(): void;
  onDelete?(id: string): void;
}

function formatRelative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function ThreadListRail({
  threads,
  activeId,
  unreadByThread,
  onPick,
  onNew,
  onDelete,
}: ThreadListRailProps) {
  const now = Date.now();

  return (
    <aside
      data-testid="thread-list-rail"
      className="flex w-[240px] flex-shrink-0 flex-col border-r border-[var(--border)]"
    >
      <header className="flex h-8 items-center justify-between border-b border-[var(--border-weak)] px-3 text-[10px] uppercase tracking-wider text-[var(--dim)]">
        <span>threads</span>
        <button
          data-testid="thread-list-new"
          type="button"
          onClick={onNew}
          className="rounded px-1 text-[var(--accent)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          title="New chat"
        >
          + new
        </button>
      </header>
      <ul data-testid="thread-list-items" role="listbox" className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <li data-testid="thread-list-empty" className="px-3 py-2 text-[11px] text-[var(--dim)]">
            — no threads —
          </li>
        ) : (
          threads.map((t) => {
            const active = t.id === activeId;
            const unread = unreadByThread[t.id] ?? 0;
            return (
              <li
                key={t.id}
                role="option"
                aria-selected={active}
                data-testid="thread-list-item"
                data-thread-id={t.id}
                data-active={active ? "true" : "false"}
                className="group relative"
              >
                <button
                  type="button"
                  onClick={() => onPick(t.id)}
                  className="flex w-full flex-col px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
                  style={{
                    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    color: active ? "var(--accent)" : "var(--fg)",
                  }}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {unread > 0 && !active ? (
                      <span
                        data-testid="thread-unread-dot"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                        aria-label={`${unread} unread`}
                      />
                    ) : null}
                    <span className="truncate">{t.title || "untitled"}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-[var(--dim)]">
                    <span
                      data-testid="thread-provider-chip"
                      className="rounded bg-[var(--surface)] px-1 py-px text-[9px] uppercase tracking-wider"
                    >
                      {t.providerKind}
                    </span>
                    <span data-testid="thread-relative-time">
                      {formatRelative(t.updatedAt, now)}
                    </span>
                  </span>
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.id);
                    }}
                    aria-label={`Delete ${t.title || "thread"}`}
                    className="absolute right-2 top-1.5 text-[var(--dim)] opacity-0 transition-opacity hover:text-[var(--red)] group-hover:opacity-100"
                    title="Delete thread"
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
