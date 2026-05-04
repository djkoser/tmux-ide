"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

interface MissionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle: string;
  initialDescription: string;
  initialBranch: string | null;
  onSubmit: (fields: {
    title: string;
    description: string;
    branch: string | null;
  }) => Promise<void> | void;
}

export function MissionEditDialog({
  open,
  onOpenChange,
  initialTitle,
  initialDescription,
  initialBranch,
  onSubmit,
}: MissionEditDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [branch, setBranch] = useState(initialBranch ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setBranch(initialBranch ?? "");
    }
  }, [open, initialTitle, initialDescription, initialBranch]);

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim() || initialTitle,
        description,
        branch: branch.trim() ? branch.trim() : null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="mission-edit-dialog"
        className="w-[min(560px,calc(100vw-32px))] p-5"
      >
        <DialogHeader>
          <DialogTitle>Edit mission</DialogTitle>
          <DialogDescription>
            Update the mission title, description, and branch. Saved instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
              Title
            </span>
            <input
              data-testid="mission-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus-visible:focus-ring"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
              Description (markdown)
            </span>
            <textarea
              data-testid="mission-edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
              Branch (optional)
            </span>
            <input
              data-testid="mission-edit-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring"
            />
          </label>
        </div>

        <DialogFooter className="mt-5">
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button onClick={handleSubmit} isPending={saving} data-testid="mission-edit-save">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
