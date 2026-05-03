"use client";

import { useMemo, useState } from "react";
import {
  useNotifications,
  type NotificationItem,
  type NotificationKind,
} from "@/lib/useNotifications";

type Filter = "all" | "unread" | NotificationKind;

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "info", label: "Info" },
  { id: "success", label: "Success" },
  { id: "warning", label: "Warning" },
  { id: "error", label: "Error" },
];

const dotColor: Record<NotificationKind, string> = {
  info: "var(--cyan)",
  success: "var(--green)",
  warning: "var(--yellow)",
  error: "var(--red)",
};

function relativeTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return `${Math.max(1, Math.round(elapsed / 1000))}s ago`;
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h ago`;
  return `${Math.round(elapsed / 86_400_000)}d ago`;
}

function matchesFilter(item: NotificationItem, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !item.read;
  return item.kind === filter;
}

export function NotificationsView() {
  const { items, unreadCount, markRead, markAllRead, clear } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [filter, items],
  );

  return (
    <div
      data-testid="notifications-view"
      className="flex h-full flex-1 flex-col bg-[var(--bg)]"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3">
        <span className="text-[12px] text-[var(--accent)]">Notifications</span>
        <span className="text-[11px] text-[var(--dim)]">{unreadCount} unread</span>
        <div className="mx-1 h-4 w-px bg-[var(--border)]" />
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            data-active={filter === item.id ? "true" : "false"}
            className={`h-5 px-1.5 text-[11px] transition-colors ${
              filter === item.id
                ? "text-[var(--accent)]"
                : "text-[var(--dim)] hover:text-[var(--fg)]"
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={markAllRead}
          className="text-[11px] text-[var(--dim)] transition-colors hover:text-[var(--fg)]"
        >
          Mark all read
        </button>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] text-[var(--dim)] transition-colors hover:text-[var(--red)]"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-[var(--dim)]">
            no notifications
          </div>
        ) : (
          visible.map((item) => (
            <div
              key={item.id}
              data-testid="notification-item"
              data-read={item.read ? "true" : "false"}
              className="grid grid-cols-[12px_minmax(0,1fr)_auto] gap-3 border-b border-[var(--border-weak)] px-3 py-2"
            >
              <span
                className="mt-1.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: dotColor[item.kind], opacity: item.read ? 0.35 : 1 }}
              />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] text-[var(--fg)]">{item.title}</span>
                  <span className="shrink-0 text-[11px] text-[var(--dim)]">
                    {relativeTime(item.timestamp)}
                  </span>
                </div>
                {item.body && (
                  <div className="mt-0.5 text-[12px] leading-5 text-[var(--dim)]">{item.body}</div>
                )}
              </div>
              {!item.read && (
                <button
                  type="button"
                  onClick={() => markRead(item.id)}
                  className="self-start text-[11px] text-[var(--dim)] transition-colors hover:text-[var(--accent)]"
                >
                  mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
