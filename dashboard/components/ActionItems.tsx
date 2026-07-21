"use client";

import { useCallback, useState } from "react";
import { fetchTodos, toggleTodo, type TodoData } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";

/**
 * Consolidated owner action items across every active workspace: one checkbox
 * list on the console root, each item badged with its directory. Toggles
 * persist through the aggregate API into the owning workspace's store.
 */
export function ActionItems() {
  const fetcher = useCallback(() => fetchTodos(), []);
  const { data: todos, refresh } = usePolling<TodoData[]>(fetcher, 3000);
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = [...(todos ?? [])].sort((a, b) => Number(a.done) - Number(b.done));
  const pending = items.filter((t) => !t.done).length;

  async function onToggle(item: TodoData) {
    setBusyId(item.id);
    try {
      await toggleTodo(item.directory, item.id, !item.done);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-b border-[var(--border)]">
      <div className="flex items-center gap-2 px-4 h-6 text-[var(--dim)] bg-[var(--surface)] border-b border-[var(--border)]">
        <span className="text-[var(--accent)]">action items</span>
        {pending > 0 && <span>{pending} pending</span>}
      </div>

      {items.length === 0 && <div className="px-4 py-2 text-[var(--dim)]">no action items</div>}

      {items.map((t) => (
        <label
          key={`${t.directory}-${t.id}`}
          className="flex items-center gap-2 px-4 py-1 cursor-pointer hover:bg-[var(--surface)]"
        >
          <input
            type="checkbox"
            checked={t.done}
            disabled={busyId === t.id}
            onChange={() => onToggle(t)}
            className="accent-[var(--accent)]"
          />
          <span
            className={
              t.done ? "line-through text-[var(--dim)]" : "text-[var(--fg)]"
            }
          >
            {t.text}
          </span>
          <span className="text-[var(--cyan)] text-[10px] border border-[var(--border)] px-1 shrink-0">
            {t.directory}
          </span>
          <span className="text-[var(--dim)] text-[10px] shrink-0">{t.source}</span>
        </label>
      ))}
    </div>
  );
}
