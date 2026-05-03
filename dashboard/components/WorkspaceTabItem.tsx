"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bell, Folder, Settings, Sparkles, X, type LucideIcon } from "lucide-react";
import type { WorkspaceTab } from "@/lib/useLayoutState";

interface WorkspaceTabItemProps {
  tab: WorkspaceTab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}

export function WorkspaceTabItem({ tab, active, onActivate, onClose }: WorkspaceTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  const Icon: LucideIcon =
    tab.kind === "settings"
      ? Settings
      : tab.kind === "notifications"
        ? Bell
        : tab.kind === "skill"
          ? Sparkles
          : Folder;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="workspace-tab"
      data-active={active ? "true" : "false"}
      data-kind={tab.kind}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onActivate();
      }}
      className={`group flex h-8 max-w-60 shrink-0 items-center gap-2 border-b-2 px-3 text-left text-[12px] transition-colors motion-safe:active:scale-[0.98] ${
        active
          ? "border-[var(--accent)] bg-[var(--surface-active)] text-[var(--accent)]"
          : "border-transparent text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
      }`}
      {...attributes}
      {...listeners}
    >
      <Icon aria-hidden="true" size={14} className="shrink-0 text-[var(--dimmer)]" />
      <span className="truncate">{tab.title}</span>
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--dim)] opacity-0 transition-opacity motion-safe:active:scale-[0.95] hover:text-[var(--red)] group-hover:opacity-100"
      >
        <X aria-hidden="true" size={13} />
      </button>
    </div>
  );
}
