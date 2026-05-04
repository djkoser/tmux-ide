"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import { createTask } from "@/lib/api";
import type { Goal } from "@/lib/types";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionName: string;
  goals: Goal[];
  defaultGoal?: string;
  onCreated?: () => void;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  sessionName,
  goals,
  defaultGoal,
  onCreated,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [goalId, setGoalId] = useState<string>(defaultGoal ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setPriority(3);
      setGoalId(defaultGoal ?? "");
      setSaving(false);
      setError(null);
    }
  }, [open, defaultGoal]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    const created = await createTask(sessionName, {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      goal: goalId || undefined,
    });
    setSaving(false);
    if (created) {
      onCreated?.();
      onOpenChange(false);
    } else {
      setError("Failed to create task");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="create-task-dialog" className="w-[min(480px,calc(100vw-32px))]">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <header className="border-b border-[var(--border-weak)] px-4 py-3">
            <DialogTitle>New task</DialogTitle>
          </header>
          <div className="flex flex-col gap-3 px-4 py-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                Title
              </span>
              <input
                autoFocus
                data-testid="create-task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to be done?"
                className="h-8 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--dim)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                Description
              </span>
              <textarea
                data-testid="create-task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="resize-y rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--dim)]"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                  Priority
                </span>
                <select
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
                  className="h-8 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                >
                  <option value={1}>P1 — critical</option>
                  <option value={2}>P2 — high</option>
                  <option value={3}>P3 — normal</option>
                  <option value={4}>P4 — low</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dimmer)]">
                  Goal
                </span>
                <select
                  value={goalId}
                  onChange={(event) => setGoalId(event.target.value)}
                  className="h-8 rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] px-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">none</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && (
              <div data-testid="create-task-error" className="text-[11px] text-[var(--red)]">
                {error}
              </div>
            )}
          </div>
          <footer className="flex justify-end gap-2 border-t border-[var(--border-weak)] px-4 py-3">
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              data-testid="create-task-submit"
              isPending={saving}
              disabled={saving}
            >
              Create
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
