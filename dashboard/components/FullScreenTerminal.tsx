"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { TerminalManager } from "@/components/TerminalManager";
import { TerminalTabItem } from "@/components/TerminalTabItem";
import { useKeybind } from "@/lib/useKeybinds";
import { useLayoutState } from "@/lib/useLayoutState";

function projectFromPath(pathname: string): string {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : "default";
}

export function FullScreenTerminal() {
  const pathname = usePathname();
  const currentProjectName = projectFromPath(pathname);
  const {
    terminalOpen,
    toggleTerminal,
    closeTerminalMode,
    newTab,
    closeTab,
    setActiveTab,
    reorderTabs,
    getProjectTabs,
    getActiveTabId,
  } = useLayoutState();

  const projectTabs = getProjectTabs(currentProjectName);
  const activeTabId = getActiveTabId(currentProjectName);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const tabIds = useMemo(() => projectTabs.map((tab) => tab.id), [projectTabs]);

  // Cmd+J / Ctrl+J — VS Code-style panel toggle (less Mac key conflict than `).
  useKeybind("Mod+j", () => toggleTerminal(), { allowInput: true });
  useKeybind(
    "Escape",
    () => {
      if (terminalOpen) closeTerminalMode();
    },
    { allowInput: true },
  );

  // First time the user opens terminal mode for a project that has no tabs,
  // create one so the panel never shows up empty.
  useEffect(() => {
    if (!terminalOpen) return;
    if (projectTabs.length > 0) return;
    newTab(currentProjectName);
  }, [currentProjectName, newTab, projectTabs.length, terminalOpen]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = tabIds.indexOf(String(active.id));
    const to = tabIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    const next = [...tabIds];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    reorderTabs(next);
  }

  if (!terminalOpen) return null;

  return (
    <section
      data-testid="full-screen-terminal"
      data-project={currentProjectName}
      className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[var(--term-bg)]"
      aria-label="Full-screen terminal"
    >
      <div className="flex h-8 shrink-0 items-stretch border-b border-[var(--border-weak)] bg-[var(--surface)]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div className="flex min-w-0 flex-1 overflow-x-auto">
              {projectTabs.map((tab) => (
                <TerminalTabItem
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTabId}
                  onActivate={() => setActiveTab(currentProjectName, tab.id)}
                  onClose={() => closeTab(tab.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          data-testid="terminal-new-tab"
          onClick={() => newTab(currentProjectName)}
          className="flex h-8 w-8 shrink-0 items-center justify-center border-l border-[var(--border-weak)] text-[var(--dim)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
          aria-label="New terminal tab"
        >
          +
        </button>
        <button
          type="button"
          data-testid="terminal-close-mode"
          onClick={closeTerminalMode}
          className="flex h-8 w-8 shrink-0 items-center justify-center border-l border-[var(--border-weak)] text-[var(--dim)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--red)]"
          aria-label="Close terminal mode"
        >
          ×
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <TerminalManager />
      </div>
    </section>
  );
}
