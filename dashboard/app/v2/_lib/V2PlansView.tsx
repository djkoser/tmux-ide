"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { childrenContainBlockElement } from "./V2PlansView.helpers";
import Markdown from "react-markdown";
import { Group, Panel } from "react-resizable-panels";
import { VSeparator, HSeparator } from "./Separators";
import Badge from "@components/Badge";
import Card from "@components/Card";
import CodeBlock from "@components/CodeBlock";
import RowSpaceBetween from "@components/RowSpaceBetween";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  fetchPlan,
  fetchPlans,
  markPlanDone,
  savePlan,
  updateTask,
  type PlanData,
  type PlanStatus,
  type PlanSummary,
} from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { useToasts } from "@/lib/useToasts";
import { AuthorshipBar } from "@/components/AuthorshipBar";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import type { Task } from "@/lib/types";

interface V2PlansViewProps {
  sessionName: string;
  tasks: Task[];
}

const STATUS_GLYPH: Record<string, string> = {
  todo: "○",
  "in-progress": "◐",
  review: "◑",
  done: "●",
};

const PLAN_STATUSES: ReadonlyArray<PlanStatus | "all"> = [
  "all",
  "in-progress",
  "pending",
  "done",
];

const PROGRESS_CELLS = 16;
const TASK_REF_RE = /\bT(\d{3})\b|\bTask\s+(\d{3})\b/g;

function progressBar(filled: number): string {
  const safe = Math.max(0, Math.min(PROGRESS_CELLS, Math.round(filled)));
  return "▒".repeat(safe) + "░".repeat(PROGRESS_CELLS - safe);
}

function tasksLinkedToPlan(tasks: Task[], plan: PlanSummary | null): Task[] {
  if (!plan) return [];
  const needle = plan.name.toLowerCase();
  return tasks.filter((t) => t.description?.toLowerCase().includes(needle));
}

function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const ms = Date.now() - t;
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

/**
 * Splits a string on T-task references and wraps each match with a tooltip
 * showing the task title + status. Used inside markdown text-level overrides.
 */
function linkifyTaskRefs(text: string, tasks: Task[]): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  TASK_REF_RE.lastIndex = 0;
  while ((m = TASK_REF_RE.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    const id = (m[1] ?? m[2])!;
    const task = tasks.find((t) => t.id === id);
    if (task) {
      out.push(
        <Tooltip key={`${id}-${m.index}`}>
          <TooltipTrigger
            render={
              <span
                className="cursor-help underline decoration-[var(--theme-border-subdued,var(--border))] decoration-dotted underline-offset-2 text-[var(--accent)]"
                data-task-ref={id}
              >
                {m[0]}
              </span>
            }
          />
          <TooltipContent>
            <span className="font-mono text-[10px]">{STATUS_GLYPH[task.status] ?? "·"} </span>
            <span className="font-medium">{task.title}</span>
            <span className="ml-2 text-[10px] text-[var(--dim)]">{task.status}</span>
          </TooltipContent>
        </Tooltip>,
      );
    } else {
      out.push(m[0]);
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

/**
 * Recursively walk children and apply linkifyTaskRefs to plain text strings.
 */
function linkifyChildren(children: ReactNode, tasks: Task[]): ReactNode {
  if (typeof children === "string") {
    return linkifyTaskRefs(children, tasks);
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => {
      if (typeof c === "string") {
        return <span key={i}>{linkifyTaskRefs(c, tasks)}</span>;
      }
      return c;
    });
  }
  return children;
}

export function V2PlansView({ sessionName, tasks }: V2PlansViewProps) {
  const fetcher = useCallback(() => fetchPlans(sessionName), [sessionName]);
  const { data: plans, refresh: refreshPlans } = usePolling<PlanSummary[]>(fetcher, 10000);
  const { push } = useToasts();

  const [statusFilter, setStatusFilter] = useState<PlanStatus | "all">("all");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData>({ content: "", authorship: null });
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    if (statusFilter === "all") return plans;
    return plans.filter((p) => p.status === statusFilter);
  }, [plans, statusFilter]);

  const selectedPlan = useMemo(
    () => plans?.find((p) => p.path === selectedFile) ?? null,
    [plans, selectedFile],
  );

  useEffect(() => {
    if (!selectedFile && filteredPlans.length > 0) {
      setSelectedFile(filteredPlans[0]!.path);
    }
  }, [filteredPlans, selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setPlanData({ content: "", authorship: null });
      setEditing(false);
      return;
    }
    setEditing(false);
    fetchPlan(sessionName, selectedFile)
      .then((d) => {
        setPlanData(d);
        setEditContent(d.content);
      })
      .catch(() => setPlanData({ content: "", authorship: null }));
  }, [selectedFile, sessionName]);

  const linkedTasks = useMemo(() => tasksLinkedToPlan(tasks, selectedPlan), [tasks, selectedPlan]);
  const doneCount = linkedTasks.filter((t) => t.status === "done").length;
  const pct = linkedTasks.length > 0 ? doneCount / linkedTasks.length : 0;
  const filled = Math.round(pct * PROGRESS_CELLS);

  async function handleSave(content: string) {
    if (!selectedFile) return;
    setSaving(true);
    const ok = await savePlan(sessionName, selectedFile, content);
    if (ok) {
      const d = await fetchPlan(sessionName, selectedFile);
      setPlanData(d);
      setEditContent(d.content);
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleMarkDone() {
    if (!selectedPlan) return;
    const ok = await markPlanDone(sessionName, selectedPlan.name);
    if (ok) refreshPlans();
  }

  function handleConvert() {
    push({
      kind: "info",
      title: "Plan→Mission converter coming soon",
    });
  }

  /**
   * Toggle a task's status when a markdown checkbox is clicked. Find the
   * matching task by line text equality (case-insensitive); if no match,
   * silently no-op (the visual checkbox state still flips locally because
   * the markdown re-renders from updated content).
   */
  async function handleCheckboxToggle(lineText: string, checked: boolean): Promise<void> {
    const trimmed = lineText.trim().toLowerCase();
    if (!trimmed) return;
    const matched = tasks.find((t) => t.title.toLowerCase().trim() === trimmed);
    if (!matched) return;
    await updateTask(sessionName, matched.id, { status: checked ? "done" : "todo" }).catch(() => {
      /* surface via toast in a future iteration */
    });
  }

  const markdownComponents = useMemo(
    () => buildMarkdownComponents(tasks, handleCheckboxToggle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, sessionName],
  );

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full min-h-0 flex-col bg-[var(--bg)] text-[var(--fg)]">
        <header
          data-testid="v2-plans-header"
          className="flex h-7 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-strong)] px-3 text-[11px] tabular-nums"
        >
          <span className="font-medium text-[var(--fg)] truncate">
            {selectedPlan?.title || selectedPlan?.name || "Plans"}
          </span>
          {selectedPlan && (
            <Badge>{selectedPlan.status}</Badge>
          )}
          <span
            aria-hidden="true"
            className="font-mono text-[var(--accent)]"
            title={`${doneCount}/${linkedTasks.length} linked tasks done`}
          >
            {progressBar(filled)}
          </span>
          <span className="text-[10px] text-[var(--dim)]">
            {linkedTasks.length === 0
              ? "no linked tasks"
              : `${doneCount}/${linkedTasks.length}`}
          </span>
          <span className="flex-1" />
          {selectedPlan && (
            <>
              <button
                type="button"
                data-testid="v2-plans-edit"
                onClick={() => {
                  if (editing) {
                    setEditing(false);
                  } else {
                    setEditContent(planData.content);
                    setEditing(true);
                  }
                }}
                className="text-[var(--dim)] hover:text-[var(--fg)] transition-colors"
              >
                {editing ? "[cancel]" : "[edit]"}
              </button>
              {selectedPlan.status !== "done" && (
                <button
                  type="button"
                  data-testid="v2-plans-done"
                  onClick={() => void handleMarkDone()}
                  className="text-[var(--green)] hover:text-[var(--fg)] transition-colors"
                >
                  [done]
                </button>
              )}
              <button
                type="button"
                data-testid="v2-plans-convert"
                onClick={handleConvert}
                className="text-[var(--dim)] hover:text-[var(--fg)] transition-colors"
              >
                [convert]
              </button>
            </>
          )}
        </header>

        <div className="flex-1 min-h-0">
          <Group orientation="horizontal">
            {/* LEFT RAIL */}
            <Panel id="plans-rail-left" defaultSize={20} minSize={14}>
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex h-7 shrink-0 items-center gap-px border-b border-[var(--border)] bg-[var(--surface)] px-1 text-[10px]">
                  {PLAN_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-testid={`v2-plans-filter-${s}`}
                      onClick={() => setStatusFilter(s)}
                      className={
                        statusFilter === s
                          ? "px-1.5 py-0.5 text-[var(--accent)]"
                          : "px-1.5 py-0.5 text-[var(--dim)] hover:text-[var(--fg)]"
                      }
                    >
                      {s === "all" ? `all (${plans?.length ?? 0})` : s}
                    </button>
                  ))}
                </div>
                <ul className="m-0 list-none flex-1 overflow-y-auto p-0">
                  {filteredPlans.map((p) => {
                    const sel = selectedFile === p.path;
                    return (
                      <li key={p.path}>
                        <button
                          type="button"
                          data-testid={`v2-plans-item-${p.name}`}
                          onClick={() => setSelectedFile(p.path)}
                          className={
                            sel
                              ? "flex w-full items-center gap-1.5 border-l-2 border-[var(--accent)] bg-[var(--surface-hover)] px-2 py-1 text-left text-[12px] text-[var(--accent)]"
                              : "flex w-full items-center gap-1.5 border-l-2 border-transparent px-2 py-1 text-left text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover)]"
                          }
                        >
                          <span aria-hidden="true" className="font-mono text-[10px] text-[var(--dim)]">
                            {p.status === "done" ? "✓" : p.status === "in-progress" ? "●" : "○"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{p.title || p.name}</span>
                        </button>
                      </li>
                    );
                  })}
                  {filteredPlans.length === 0 && (
                    <li className="px-2 py-2 text-[11px] text-[var(--dim)]">— no plans —</li>
                  )}
                </ul>
              </div>
            </Panel>

            <VSeparator />

            {/* CENTER */}
            <Panel id="plans-center" defaultSize={56} minSize={30}>
              <div className="flex h-full flex-col overflow-hidden">
                {editing ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 text-[11px]">
                      <span className="text-[var(--dim)]">editing</span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        data-testid="v2-plans-save"
                        disabled={saving}
                        onClick={() => void handleSave(editContent)}
                        className="text-[var(--accent)] hover:text-[var(--fg)] disabled:opacity-50"
                      >
                        {saving ? "[saving…]" : "[save ⌘S]"}
                      </button>
                    </div>
                    <MarkdownEditor
                      key={selectedFile}
                      value={editContent}
                      onChange={setEditContent}
                      onSave={handleSave}
                    />
                  </div>
                ) : selectedPlan ? (
                  <div
                    data-testid="v2-plans-markdown"
                    className="prose-sm h-full max-w-3xl overflow-y-auto px-4 py-3"
                  >
                    <Markdown components={markdownComponents}>{planData.content}</Markdown>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--dim)]">
                    select a plan to view
                  </div>
                )}
              </div>
            </Panel>

            <VSeparator />

            {/* RIGHT RAIL */}
            <Panel id="plans-rail-right" defaultSize={24} minSize={14}>
              <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
                <Card title="LINKED TASKS" mode="left">
                  {linkedTasks.length === 0 ? (
                    <p className="text-[var(--dim)]">— no linked tasks —</p>
                  ) : (
                    linkedTasks.slice(0, 16).map((t) => (
                      <RowSpaceBetween key={t.id}>
                        <span className="truncate">
                          <span aria-hidden="true" className="mr-1 font-mono">
                            {STATUS_GLYPH[t.status] ?? "·"}
                          </span>
                          {t.title}
                        </span>
                        <span className="text-[var(--dim)] tabular-nums">{t.id}</span>
                      </RowSpaceBetween>
                    ))
                  )}
                </Card>

                <Card title="AUTHORSHIP" mode="left">
                  <AuthorshipBar authorship={planData.authorship} />
                </Card>

                <Card title="HISTORY" mode="left">
                  <PlanHistory plan={selectedPlan} />
                </Card>
              </div>
            </Panel>
          </Group>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * react-markdown components map. Wraps text-level nodes with linkify, swaps
 * code blocks to TUI CodeBlock, and turns `- [ ]` checkboxes into clickable
 * inputs that toggle the matching task.
 */
function buildMarkdownComponents(
  tasks: Task[],
  onCheckbox: (lineText: string, checked: boolean) => Promise<void>,
) {
  return {
    p({ children }: { children?: ReactNode }) {
      // react-markdown emits a <p> wrapper around every paragraph, including
      // ones whose only content is a fenced code block (rendered by our
      // `code` override as <CodeBlock>, which emits <pre>). <pre> inside <p>
      // is invalid HTML and triggers a React hydration warning. Unwrap.
      if (childrenContainBlockElement(children)) {
        return <Fragment>{linkifyChildren(children, tasks)}</Fragment>;
      }
      return <p>{linkifyChildren(children, tasks)}</p>;
    },
    li({ children, ...rest }: { children?: ReactNode; checked?: boolean | null }) {
      // react-markdown gfm passes `checked: boolean | null` for task list items.
      const checked = (rest as { checked?: boolean | null }).checked;
      if (typeof checked === "boolean") {
        // Children typically begin with a hidden <input> followed by text.
        // Extract the trailing text content as the task title candidate.
        const flat = flattenText(children);
        return (
          <li className="list-none">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                defaultChecked={checked}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  void onCheckbox(flat, e.target.checked);
                }}
                className="cursor-pointer accent-[var(--accent)]"
              />
              <span className={checked ? "text-[var(--dim)] line-through" : ""}>
                {linkifyChildren(stripLeadingCheckbox(children), tasks)}
              </span>
            </label>
          </li>
        );
      }
      return <li>{linkifyChildren(children, tasks)}</li>;
    },
    code({ inline, className, children }: { inline?: boolean; className?: string; children?: ReactNode }) {
      if (inline) {
        return <code className={className}>{children}</code>;
      }
      const text = typeof children === "string" ? children : flattenText(children);
      return <CodeBlock>{text}</CodeBlock>;
    },
    a({ href, children }: { href?: string; children?: ReactNode }) {
      return (
        <a href={href} className="text-[var(--accent)] underline" target="_blank" rel="noreferrer">
          {linkifyChildren(children, tasks)}
        </a>
      );
    },
    strong({ children }: { children?: ReactNode }) {
      return <strong>{linkifyChildren(children, tasks)}</strong>;
    },
    em({ children }: { children?: ReactNode }) {
      return <em>{linkifyChildren(children, tasks)}</em>;
    },
  };
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (typeof node === "object" && "props" in (node as { props?: { children?: ReactNode } })) {
    return flattenText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function stripLeadingCheckbox(children: ReactNode): ReactNode {
  // react-markdown renders the list-item input as the first child; we render
  // our own input above, so drop any input descendants from the rendered text.
  if (Array.isArray(children)) {
    return children.filter((c) => {
      if (typeof c === "object" && c !== null && "type" in (c as { type?: unknown })) {
        return (c as { type?: unknown }).type !== "input";
      }
      return true;
    });
  }
  return children;
}

function PlanHistory({ plan }: { plan: PlanSummary | null }) {
  if (!plan) {
    return <p className="text-[var(--dim)]">— no history —</p>;
  }
  const updated = timeAgo(plan.updated ?? null);
  const completed = timeAgo(plan.completed ?? null);
  const owner = plan.owner ?? null;
  return (
    <ul className="m-0 list-none p-0 text-[11px] text-[var(--dim)]">
      {completed && (
        <li>
          <span className="text-[var(--green)]">{completed}</span>
          {owner ? <> · {owner}</> : null} done
        </li>
      )}
      {updated && (
        <li>
          <span className="text-[var(--accent)]">{updated}</span>
          {owner ? <> · {owner}</> : null} updated
        </li>
      )}
      {!completed && !updated && (
        <li>{plan.status === "done" ? "completed" : "in progress"}</li>
      )}
    </ul>
  );
}
