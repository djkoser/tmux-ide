/**
 * Solid wrappers around each @tmux-ide/v2-solid-widgets mount factory.
 * The route file imports these and renders them per-view-id; data
 * comes from the polled fetchers in ./projectData.ts.
 *
 * The widgets are written prop-driven: we hand them an `options`
 * accessor and the host signal updates re-fire `setOptions` via the
 * generic [[WidgetHost]] component.
 */

import { createEffect, createMemo, createSignal, on, onMount, Show, type JSX } from "solid-js";
import {
  mountActivity,
  mountCostsDashboard,
  mountInspector,
  mountKanbanBoard,
  mountMissionControlDashboard,
  mountPlansRail,
  mountSkillsView,
  mountTasksView,
  type ActivityMountOptions,
  type CostsAgentEntry,
  type CostsDashboardMountOptions,
  type CostsDashboardSnapshot,
  type CostsMilestoneEntry,
  type CostsTimelineEntry,
  type DashboardAgent,
  type DashboardEvent,
  type DashboardMilestone,
  type DashboardTask,
  type InspectorMountOptions,
  type InspectorScope,
  type KanbanBoardMountOptions,
  type KanbanTask,
  type MissionControlDashboardMountOptions,
  type PlansPanelAuthorship,
  type PlansPanelMountOptions,
  type PlansRailMountOptions,
  type SkillsViewMountOptions,
  type SkillSummary,
  type TasksViewMountOptions,
  type TasksTask,
} from "@tmux-ide/v2-solid-widgets";
import { Terminal } from "@/components/Terminal";
import { API_BASE } from "@/lib/api";
import { renderMarkdownHighlighted } from "@/lib/syntax/markdownShiki";
import { ProblemsTab } from "./ProblemsTab";
import { totalDiagnosticsCount } from "@/lib/lsp/diagnostics-store";
import { TabStrip, type TabStripItem } from "@/components/ui/TabStrip";
import { WidgetHost } from "@tmux-ide/v2-solid-widgets";
import {
  createMetrics,
  createProjectDetail,
  createProjectEvents,
  fetchSkill,
  type ProjectDetailLike,
  type ProjectEventLike,
} from "./projectData";

interface ProjectProps {
  projectName: string;
}

/** Mission + Mission Control share the same dashboard surface for now. */
export function MissionControlView(props: ProjectProps): JSX.Element {
  const { detail } = createProjectDetail(() => props.projectName);
  const { events } = createProjectEvents(() => props.projectName);

  const options = createMemo<MissionControlDashboardMountOptions>(() => {
    const d: ProjectDetailLike | null = detail();
    const ev: ProjectEventLike[] = events();
    return {
      snapshot: {
        mission: d?.mission
          ? {
              title: d.mission.title ?? "",
              description: d.mission.description ?? "",
              status: d.mission.status ?? "",
              branch: d.mission.branch ?? null,
            }
          : null,
        validation: d?.validationSummary ?? null,
        milestones: ((d?.milestones ?? d?.mission?.milestones ?? []) as DashboardMilestone[]).map(
          (m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            order: m.order ?? 0,
            taskCount: m.taskCount ?? 0,
            tasksDone: m.tasksDone ?? 0,
          }),
        ),
        tasks: (d?.tasks ?? []).map<DashboardTask>((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          milestone: t.milestone ?? null,
          assignee: t.assignee ?? null,
        })),
        agents: (d?.agents ?? []) as DashboardAgent[],
        events: ev as DashboardEvent[],
      },
    };
  });

  return (
    <WidgetHost mount={mountMissionControlDashboard} options={options} class="h-full w-full" />
  );
}

export function KanbanBoardView(props: ProjectProps): JSX.Element {
  const { detail } = createProjectDetail(() => props.projectName);

  const options = createMemo<KanbanBoardMountOptions>(() => {
    const d = detail();
    const tasks: KanbanTask[] = (d?.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority ?? 3,
      assignee: t.assignee ?? null,
      goal: t.goal ?? null,
      milestone: t.milestone ?? null,
      depends_on: t.depends_on ?? [],
      tags: t.tags ?? [],
      description: t.description ?? null,
      created: t.created,
      updated: t.updated,
    }));
    return {
      tasks,
      density: "compact",
    };
  });

  return <WidgetHost mount={mountKanbanBoard} options={options} class="h-full w-full" />;
}

export function TasksDashboardView(props: ProjectProps): JSX.Element {
  const { detail } = createProjectDetail(() => props.projectName);

  const options = createMemo<TasksViewMountOptions>(() => {
    const d = detail();
    const tasks: TasksTask[] = (d?.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority ?? 3,
      assignee: t.assignee ?? null,
      goal: t.goal ?? null,
      milestone: t.milestone ?? null,
      depends_on: t.depends_on ?? [],
      tags: t.tags ?? [],
      description: t.description ?? null,
      created: t.created,
      updated: t.updated,
      proof: t.proof,
    }));
    return {
      tasks,
      goals: (d?.goals ?? []).map((g) => ({ id: g.id, title: g.title })),
      milestones: (d?.milestones ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        order: m.order ?? 0,
      })),
      density: "compact",
    };
  });

  return <WidgetHost mount={mountTasksView} options={options} class="h-full w-full" />;
}

/**
 * Plan body renderer. The plan markdown used to dump into a raw
 * monospace `<pre>`; now it routes through the shared shiki markdown
 * pipeline so headings, tables, and fenced code render richly. The
 * synchronous fallback (chat-solid `renderMarkdown`) is replaced by
 * the highlighted HTML once the async shiki pass resolves.
 */
function PlanBodyView(props: {
  plan: PlansPanelMountOptions["plan"];
  data: PlansPanelMountOptions["planData"];
}): JSX.Element {
  const [html, setHtml] = createSignal<string>("");
  createEffect(
    on(
      () => props.data?.content ?? "",
      (content) => {
        if (!content) {
          setHtml("");
          return;
        }
        let stale = false;
        void renderMarkdownHighlighted(content)
          .then((out) => {
            if (!stale) setHtml(out);
          })
          .catch(() => {
            if (!stale) setHtml("");
          });
        return () => {
          stale = true;
        };
      },
    ),
  );
  return (
    <div data-testid="plan-body" class="h-full overflow-y-auto bg-[var(--bg)]">
      <Show when={props.plan}>
        {(meta) => (
          <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-strong,var(--bg))] px-8 py-3">
            <h1 class="text-[13px] font-medium text-[var(--fg)]">{meta().title}</h1>
            <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
              {meta().status}
            </span>
          </header>
        )}
      </Show>
      <Show
        when={html()}
        fallback={
          <div class="flex h-40 items-center justify-center text-[12px] text-[var(--dim)]">
            Rendering plan…
          </div>
        }
      >
        <div
          class="chat-markdown w-full max-w-3xl px-8 py-8"
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={html()}
        />
      </Show>
    </div>
  );
}

/**
 * Plans surface: rail on the left, panel body on the right. The rail
 * owns its own polling (it calls /api/project/:name/plans internally);
 * the panel is prop-driven, so we fetch the body when a selection
 * changes.
 */
export function PlansSurfaceView(props: ProjectProps): JSX.Element {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [planData, setPlanData] = createSignal<PlansPanelMountOptions["planData"]>(null);
  const [planMeta, setPlanMeta] = createSignal<PlansPanelMountOptions["plan"]>(null);

  async function loadPlanBody(filename: string): Promise<void> {
    try {
      const res = await fetch(
        `${API_BASE}/api/project/${encodeURIComponent(props.projectName)}/plans/${encodeURIComponent(filename)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        plan?: { name?: string; path?: string; title?: string; status?: string };
        content?: string;
        authorship?: unknown;
        mtime?: number | null;
      };
      if (json.plan) {
        setPlanMeta({
          name: json.plan.name ?? filename,
          path: json.plan.path ?? filename,
          title: json.plan.title ?? filename,
          status: json.plan.status ?? "in-progress",
        });
      }
      setPlanData({
        content: json.content ?? "",
        authorship: (json.authorship as PlansPanelAuthorship | null | undefined) ?? null,
        mtime: json.mtime ?? null,
      });
    } catch {
      /* ignore */
    }
  }

  const railOptions = createMemo<PlansRailMountOptions>(() => ({
    sessionName: props.projectName,
    apiBaseUrl: API_BASE,
    bearerToken: null,
    selectedFile: selected(),
    onSelect: (filename: string) => {
      setSelected(filename);
      void loadPlanBody(filename);
    },
    onCreate: () => {
      /* host owns creation; not wired for placeholder pass */
    },
  }));

  return (
    <div
      class="grid h-full w-full min-h-0"
      style={{ "grid-template-columns": "260px minmax(0, 1fr)" }}
    >
      <aside class="overflow-hidden border-r border-[var(--border)]">
        <WidgetHost mount={mountPlansRail} options={railOptions} class="h-full w-full" />
      </aside>
      <main class="overflow-hidden">
        <Show
          when={selected()}
          fallback={
            <div class="flex h-full items-center justify-center p-6 text-[12px] text-[var(--dim)]">
              Select a plan from the rail to view it here.
            </div>
          }
        >
          <PlanBodyView plan={planMeta()} data={planData()} />
        </Show>
      </main>
    </div>
  );
}

export function SkillsSurfaceView(props: ProjectProps): JSX.Element {
  const [skills, setSkills] = createSignal<SkillSummary[]>([]);
  const [selected, setSelected] = createSignal<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadList(): Promise<void> {
    try {
      const res = await fetch(
        `${API_BASE}/api/project/${encodeURIComponent(props.projectName)}/skills`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { skills?: SkillSummary[] };
      if (json.skills) setSkills(json.skills);
    } catch {
      /* ignore */
    }
  }

  async function hydrateSelected(name: string): Promise<void> {
    const skill = await fetchSkill(props.projectName, name);
    if (!skill) return;
    setSkills((prev) =>
      prev.map((s) =>
        s.name === skill.name
          ? {
              name: skill.name,
              role: skill.role,
              description: skill.description,
              specialties: skill.specialties,
              body: skill.body,
            }
          : s,
      ),
    );
  }

  onMount(() => {
    void loadList();
    pollTimer = setInterval(() => void loadList(), 8000);
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  });

  const options = createMemo<SkillsViewMountOptions>(() => ({
    skills: skills(),
    initialSelected: selected(),
    onSelect: (name: string) => {
      setSelected(name);
      void hydrateSelected(name);
    },
  }));

  return <WidgetHost mount={mountSkillsView} options={options} class="h-full w-full" />;
}

export function CostsView(props: ProjectProps): JSX.Element {
  const { metrics, loaded } = createMetrics(() => props.projectName);
  const options = createMemo<CostsDashboardMountOptions>(() => {
    const m = metrics();
    // Still in flight — let the widget render its loading spinner.
    if (!m && !loaded()) return { snapshot: null };
    // Daemon answered (success or failure) but produced no metrics —
    // pass a fully-shaped empty snapshot so the widget trips its
    // "No usage yet" empty state instead of hanging on the spinner.
    const snapshot: CostsDashboardSnapshot = {
      session: m?.session ?? { startedAt: null, durationMs: 0, status: "idle", agentCount: 0 },
      tasks: (m?.tasks as CostsDashboardSnapshot["tasks"]) ?? {
        total: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        completionRate: 0,
        retryRate: 0,
        avgDurationMs: 0,
        medianDurationMs: 0,
        p90DurationMs: 0,
        byMilestone: [] as CostsMilestoneEntry[],
      },
      agents: (m?.agents as CostsAgentEntry[]) ?? [],
      mission: m?.mission ?? {
        title: null,
        status: null,
        milestonesCompleted: 0,
        validationPassRate: 0,
        wallClockMs: 0,
      },
      timeline: (m?.timeline as CostsTimelineEntry[]) ?? [],
    };
    return { snapshot };
  });

  return <WidgetHost mount={mountCostsDashboard} options={options} class="h-full w-full" />;
}

export function InspectorPaneView(props: {
  projectName: string;
  currentView: string;
}): JSX.Element {
  const { events } = createProjectEvents(() => props.projectName);
  const options = createMemo<InspectorMountOptions>(() => ({
    events: events(),
    currentView: props.currentView as InspectorScope,
    hideHeartbeats: true,
  }));
  return <WidgetHost mount={mountInspector} options={options} class="h-full w-full" />;
}

/**
 * BottomPanel: replaces the placeholder. Adds a tab strip for
 * Terminal / Output (Activity). The terminal preserves its existing
 * behaviour; Output mounts the Activity widget against the same event
 * stream the Inspector uses.
 */
export function BottomPanelView(props: ProjectProps): JSX.Element {
  type Tab = "terminal" | "problems" | "output";
  const [tab, setTab] = createSignal<Tab>("terminal");
  const { events } = createProjectEvents(() => props.projectName);
  const problemCount = createMemo<number>(() => totalDiagnosticsCount(2));

  const activityOptions = createMemo<ActivityMountOptions>(() => ({
    events: events(),
    hideHeartbeats: true,
  }));

  const tabs = createMemo<TabStripItem<Tab>[]>(() => [
    { id: "terminal", label: "terminal" },
    {
      id: "problems",
      label: "problems",
      badge:
        problemCount() > 0 ? (
          <span
            data-testid="v2-problems-badge"
            class="rounded bg-[var(--red,#cc6666)] px-1 text-[9px] font-mono text-[var(--bg)]"
          >
            {problemCount()}
          </span>
        ) : undefined,
    },
    { id: "output", label: "output" },
  ]);

  return (
    <div data-testid="v2-bottom-panel-host" class="flex h-full min-h-0 flex-col overflow-hidden">
      <TabStrip
        items={tabs()}
        activeId={tab()}
        onSelect={setTab}
        testid="v2-bottom-tab"
        ariaLabel="Bottom panel sections"
      />
      <div class="min-h-0 flex-1">
        <Show when={tab() === "terminal"}>
          <Terminal id={`v2-${props.projectName}`} showHeader={false} />
        </Show>
        <Show when={tab() === "problems"}>
          <ProblemsTab />
        </Show>
        <Show when={tab() === "output"}>
          <WidgetHost mount={mountActivity} options={activityOptions} class="h-full w-full" />
        </Show>
      </div>
    </div>
  );
}
