"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
      className={`group flex h-8 max-w-60 shrink-0 items-center gap-2 border-b-2 px-3 text-left text-[12px] transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--surface-active)] text-[var(--accent)]"
          : "border-transparent text-[var(--dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
      }`}
      {...attributes}
      {...listeners}
    >
      <span className="text-[var(--dimmer)]">{tab.kind === "settings" ? "⚙" : "▦"}</span>
      <span className="truncate">{tab.title}</span>
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--dim)] opacity-0 transition-opacity hover:text-[var(--red)] group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
