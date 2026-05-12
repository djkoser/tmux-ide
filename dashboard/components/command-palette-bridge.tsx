"use client";

/**
 * React → Solid bridge for the unified CommandPalette widget.
 *
 * Owns:
 *   - The palette's open/close state via the shared store exported from
 *     dashboard/components/CommandPalette.tsx (openCommandPalette /
 *     closeCommandPalette / subscribePalette / getPaletteSnapshot).
 *   - All result data fetched from the daemon on open:
 *       * Providers   /api/chat/providers
 *       * Skills      /api/project/:name/skills
 *       * Tasks       useSessionStream snapshot.tasks (passed in as prop)
 *       * Threads     /api/threads
 *   - Plus two purely-local sources:
 *       * Views       fixed activity-bar ids
 *       * Commands    actions registered via lib/actions.ts
 *
 * Routes selection per-category:
 *   - views        → onViewSelect(id)
 *   - skills       → switch to skills view + push ?skill=NAME
 *   - tasks        → switch to kanban view + push ?task=ID
 *   - threads      → switch to chat view + push ?thread=ID
 *   - providers    → costs view (no per-provider config UI yet)
 *   - commands     → runAction(id)
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  closeCommandPalette,
  getPaletteSnapshot,
  subscribePalette,
} from "@/components/CommandPalette";
import { useActions, runAction } from "@/lib/actions";
import type { Task } from "@/lib/types";

interface PaletteItem {
  id: string;
  label: string;
  description?: string | null;
  keywords?: ReadonlyArray<string>;
  keybind?: string;
}

type PaletteCategoryId =
  | "providers"
  | "skills"
  | "tasks"
  | "threads"
  | "views"
  | "commands";

interface PaletteCategoryDef {
  category: PaletteCategoryId;
  label: string;
  items: ReadonlyArray<PaletteItem>;
}

interface CommandPaletteMountHandle {
  unmount(): void;
  setOptions(next: {
    open?: boolean;
    categories?: ReadonlyArray<PaletteCategoryDef>;
    onSelect?: (category: PaletteCategoryId, id: string) => void;
    onDismiss?: () => void;
  }): void;
}

const PALETTE_VIEWS: ReadonlyArray<{ id: string; label: string; keywords: string[] }> = [
  { id: "mission", label: "Mission", keywords: ["overview", "summary"] },
  { id: "mission-control", label: "Mission Control", keywords: ["dashboard", "activity"] },
  { id: "kanban", label: "Kanban", keywords: ["board", "tasks"] },
  { id: "tasks", label: "Tasks", keywords: ["list"] },
  { id: "plans", label: "Plans", keywords: ["specs", "docs"] },
  { id: "skills", label: "Skills", keywords: ["agents", "library"] },
  { id: "chat", label: "Chat", keywords: ["conversation", "ai"] },
  { id: "terminal", label: "Terminal", keywords: ["shell"] },
  { id: "files", label: "Files", keywords: ["explorer", "tree"] },
  { id: "diffs", label: "Diffs", keywords: ["git", "patch"] },
  { id: "changes", label: "Changes", keywords: ["git"] },
  { id: "metrics", label: "Metrics", keywords: ["stats"] },
  { id: "costs", label: "Costs", keywords: ["billing", "providers"] },
];

interface CommandPaletteBridgeProps {
  /** Current /v2/project/:name. May be null on /v2 root. */
  projectName: string | null;
}

/**
 * Dispatched by the bridge when the user picks a view from the palette.
 * `ProjectV2Page` listens and calls setView. Plumbing the view-setter
 * directly via context/props is awkward at the layout level — the event
 * is local-page-scoped (no cross-tab leakage), tightly scoped to this
 * one interaction, and adds no shared state.
 */
const VIEW_EVENT = "tmuxide.palette-select-view";

export function CommandPaletteBridge({ projectName }: CommandPaletteBridgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CommandPaletteMountHandle | null>(null);

  const open = useSyncExternalStore(
    subscribePalette,
    getPaletteSnapshot,
    () => false,
  );

  // External data fetched lazily on open.
  const [providers, setProviders] = useState<ReadonlyArray<PaletteItem>>([]);
  const [skills, setSkills] = useState<ReadonlyArray<PaletteItem>>([]);
  const [threads, setThreads] = useState<ReadonlyArray<PaletteItem>>([]);
  const [tasks, setTasks] = useState<ReadonlyArray<Task>>([]);

  const actions = useActions((a) => !a.isAvailable || a.isAvailable());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      // Dynamic import: lib/api.ts touches `window.location` at module
      // eval (to derive API_BASE) so it cannot be loaded during SSR.
      // V2CommandPaletteHost mounts at layout level, so the bridge file
      // is part of every /v2 server render. Keep api.ts behind this
      // open-time `await import` so SSR never reaches it.
      const api = await import("@/lib/api");
      const [p, t] = await Promise.allSettled([api.chatProvidersList(), api.chatThreadList()]);
      if (cancelled) return;
      if (p.status === "fulfilled") {
        setProviders(
          p.value.providers.map((pp) => ({
            id: pp.kind,
            label: pp.displayName ?? pp.kind,
            description: pp.installed ? "installed" : "not installed",
            keywords: ["provider", pp.kind],
          })),
        );
      }
      if (t.status === "fulfilled") {
        setThreads(
          t.value.threads.slice(0, 30).map((thread) => ({
            id: thread.id,
            label: thread.title || "Untitled",
            description: thread.providerKind ?? null,
            keywords: ["chat", thread.providerKind ?? ""],
          })),
        );
      }
      if (projectName) {
        try {
          const [skillList, project] = await Promise.all([
            api.fetchSkills(projectName),
            api.fetchProject(projectName),
          ]);
          if (cancelled) return;
          setSkills(
            skillList.map((sk) => ({
              id: sk.name,
              label: sk.name,
              description: sk.description || sk.role,
              keywords: ["skill", ...(sk.specialties ?? [])],
            })),
          );
          setTasks(project?.tasks ?? []);
        } catch {
          if (!cancelled) {
            setSkills([]);
            setTasks([]);
          }
        }
      } else {
        setSkills([]);
        setTasks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectName]);

  const categories = useMemo<PaletteCategoryDef[]>(() => {
    const taskItems: PaletteItem[] = tasks.slice(0, 80).map((t) => ({
      id: t.id,
      label: `${t.id} ${t.title}`,
      description: t.assignee ? `${t.status} · @${t.assignee}` : t.status,
      keywords: ["task", t.status, t.assignee ?? "", ...(t.tags ?? [])],
    }));
    const viewItems: PaletteItem[] = PALETTE_VIEWS.map((v) => ({
      id: v.id,
      label: v.label,
      keywords: ["view", ...v.keywords],
    }));
    const commandItems: PaletteItem[] = actions.map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description ?? null,
      keywords: a.keywords,
      keybind: a.keybind ? formatKeybind(a.keybind) : undefined,
    }));
    return [
      providers.length ? { category: "providers" as const, label: "Providers", items: providers } : null,
      skills.length ? { category: "skills" as const, label: "Skills", items: skills } : null,
      taskItems.length ? { category: "tasks" as const, label: "Tasks", items: taskItems } : null,
      threads.length ? { category: "threads" as const, label: "Threads", items: threads } : null,
      { category: "views" as const, label: "Views", items: viewItems },
      commandItems.length
        ? { category: "commands" as const, label: "Commands", items: commandItems }
        : null,
    ].filter((g): g is PaletteCategoryDef => g !== null);
  }, [providers, skills, threads, tasks, actions]);

  const fireViewEvent = useCallback((viewId: string) => {
    window.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail: viewId }));
  }, []);

  const handleSelect = useCallback(
    (category: PaletteCategoryId, id: string) => {
      closeCommandPalette();
      switch (category) {
        case "views":
          fireViewEvent(id);
          break;
        case "skills": {
          fireViewEvent("skills");
          const url = new URL(window.location.href);
          url.searchParams.set("skill", id);
          window.history.replaceState(null, "", url.toString());
          break;
        }
        case "tasks": {
          fireViewEvent("kanban");
          const url = new URL(window.location.href);
          url.searchParams.set("task", id);
          window.history.replaceState(null, "", url.toString());
          break;
        }
        case "threads": {
          fireViewEvent("chat");
          const url = new URL(window.location.href);
          url.searchParams.set("thread", id);
          window.history.replaceState(null, "", url.toString());
          break;
        }
        case "providers":
          fireViewEvent("costs");
          break;
        case "commands":
          runAction(id);
          break;
        default:
          break;
      }
    },
    [fireViewEvent],
  );

  // (1) Mount once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      const mod = await import("@tmux-ide/v2-solid-widgets");
      if (cancelled) return;
      handleRef.current = mod.mountCommandPalette(el, {
        open: false,
        categories: [],
        onSelect: handleSelect,
        onDismiss: closeCommandPalette,
      });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (2) Push prop updates through setter.
  useEffect(() => {
    handleRef.current?.setOptions({ open });
  }, [open]);

  useEffect(() => {
    handleRef.current?.setOptions({ categories });
  }, [categories]);

  useEffect(() => {
    handleRef.current?.setOptions({ onSelect: handleSelect });
  }, [handleSelect]);

  return <div ref={containerRef} data-testid="command-palette-bridge" />;
}

function formatKeybind(keybind: string): string {
  return keybind
    .split("+")
    .map((part) => {
      const n = part.toLowerCase();
      if (n === "mod") return "⌘";
      if (n === "shift") return "⇧";
      if (n === "alt" || n === "option") return "⌥";
      if (n === "ctrl" || n === "control") return "⌃";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("");
}
