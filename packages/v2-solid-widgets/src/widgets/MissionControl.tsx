import { createSignal, createMemo, For, Show, onCleanup, onMount } from "solid-js";
import {
  fetchProjectDetail,
  fetchProjectEvents,
  fetchProjectMission,
  type MissionMilestone,
  type MissionResponse,
  type ProjectAgentDetail,
  type ProjectDetailPayload,
  type ProjectEvent,
  type ProjectTask,
} from "../api";
import type { BaseMountOptions } from "../types";

interface MissionControlViewProps {
  options: () => BaseMountOptions;
}

const STATUS_GLYPH: Record<string, string> = {
  todo: "○",
  "in-progress": "◐",
  active: "◐",
  validating: "◑",
  review: "◑",
  done: "●",
  locked: "·",
  pending: "○",
  failing: "!",
  passing: "✓",
};

function statusColor(status: string): string {
  switch (status) {
    case "done":
    case "passing":
      return "var(--green, var(--ansi-2-green))";
    case "active":
    case "in-progress":
      return "var(--accent, var(--ansi-4-navy))";
    case "validating":
    case "review":
      return "var(--yellow, var(--ansi-3-olive))";
    case "failing":
      return "var(--red, var(--ansi-1-maroon))";
    default:
      return "var(--theme-focused-foreground-subdued, var(--dim))";
  }
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export function MissionControlView(props: MissionControlViewProps) {
  const [mission, setMission] = createSignal<MissionResponse | null>(null);
  const [detail, setDetail] = createSignal<ProjectDetailPayload | null>(null);
  const [events, setEvents] = createSignal<ProjectEvent[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [selectedMilestone, setSelectedMilestone] = createSignal(0);

  async function refresh() {
    try {
      const opts = props.options();
      const [m, d, e] = await Promise.all([
        fetchProjectMission(opts),
        fetchProjectDetail(opts),
        fetchProjectEvents(opts),
      ]);
      setMission(m);
      setDetail(d);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    onCleanup(() => clearInterval(interval));
  });

  // Prefer milestones from mission payload (carries `order`); fall back to detail.
  const milestones = createMemo<MissionMilestone[]>(() => {
    const m = mission()?.mission?.milestones ?? detail()?.milestones ?? [];
    return [...m].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });

  const agents = createMemo<ProjectAgentDetail[]>(() => detail()?.agents ?? []);
  const wipTasks = createMemo<ProjectTask[]>(() =>
    (detail()?.tasks ?? []).filter((t) => t.status === "in-progress" || t.status === "review"),
  );

  const activeMilestone = createMemo<MissionMilestone | null>(() => {
    const list = milestones();
    return list.find((m) => m.status === "active") ?? list[0] ?? null;
  });

  // Keyboard nav for milestones — j/k or arrows.
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      const list = milestones();
      if (list.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        setSelectedMilestone((i) => Math.min(list.length - 1, i + 1));
        e.preventDefault();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        setSelectedMilestone((i) => Math.max(0, i - 1));
        e.preventDefault();
      } else if (e.key === "r") {
        void refresh();
        e.preventDefault();
      } else if (e.key === "g") {
        setSelectedMilestone(0);
        e.preventDefault();
      } else if (e.key === "G") {
        setSelectedMilestone(list.length - 1);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "min-height": "0",
        "font-family": "var(--font-family-mono, var(--font-mono))",
        "font-size": "12px",
        color: "var(--theme-text, var(--fg))",
        "background-color": "var(--theme-background, var(--bg))",
      }}
    >
      <header
        style={{
          padding: "8px 12px",
          "border-bottom": "1px solid var(--theme-border, var(--border))",
          "flex-shrink": "0",
        }}
      >
        <Show
          when={mission()?.mission}
          fallback={
            <div style={{ color: "var(--theme-focused-foreground-subdued, var(--dim))" }}>
              <Show when={!loading()} fallback={<>… loading mission</>}>
                — no mission set —
              </Show>
            </div>
          }
        >
          {(m) => (
            <>
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "12px",
                  "margin-bottom": "4px",
                }}
              >
                <span style={{ "font-weight": "500" }}>{m().title}</span>
                <Show when={m().status}>
                  <span
                    style={{
                      "font-size": "10px",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.05em",
                      padding: "1px 6px",
                      border: `1px solid ${statusColor(m().status ?? "")}`,
                      color: statusColor(m().status ?? ""),
                      "border-radius": "2px",
                    }}
                  >
                    {m().status}
                  </span>
                </Show>
                <span
                  style={{
                    color: "var(--theme-focused-foreground-subdued, var(--dim))",
                    "font-size": "11px",
                  }}
                >
                  {milestones().length} milestone{milestones().length === 1 ? "" : "s"}
                </span>
                <Show when={mission()?.validationSummary}>
                  {(v) => (
                    <span
                      style={{
                        color: "var(--theme-focused-foreground-subdued, var(--dim))",
                        "font-size": "11px",
                      }}
                    >
                      validation:{" "}
                      <span style={{ color: statusColor("passing") }}>{v().passing}</span>/
                      <span>{v().total}</span>
                    </span>
                  )}
                </Show>
              </div>
              <Show when={m().description}>
                <div
                  style={{
                    color: "var(--theme-focused-foreground-subdued, var(--dim))",
                    "font-size": "11px",
                  }}
                >
                  {m().description}
                </div>
              </Show>
            </>
          )}
        </Show>
      </header>

      <Show when={error()}>
        <div
          style={{
            padding: "4px 12px",
            color: "var(--red)",
            "background-color": "var(--bg-strong)",
            "border-bottom": "1px solid var(--red)",
            "font-size": "11px",
          }}
        >
          {error()}
        </div>
      </Show>

      {/* Agents strip */}
      <section
        style={{
          padding: "6px 12px",
          "border-bottom": "1px solid var(--theme-border-subdued, var(--border-weak))",
          "flex-shrink": "0",
          display: "flex",
          gap: "12px",
          "flex-wrap": "wrap",
          "font-size": "11px",
        }}
        data-testid="v2-mc-agents"
      >
        <span
          style={{
            color: "var(--theme-focused-foreground-subdued, var(--dim))",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
            "font-size": "10px",
          }}
        >
          Agents
        </span>
        <Show
          when={agents().length > 0}
          fallback={
            <span style={{ color: "var(--theme-focused-foreground-subdued, var(--dim))" }}>
              — none online —
            </span>
          }
        >
          <For each={agents()}>
            {(a) => (
              <span
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "4px",
                  color: a.isBusy
                    ? "var(--theme-text, var(--fg))"
                    : "var(--theme-focused-foreground-subdued, var(--dim))",
                }}
                title={a.taskTitle ?? (a.isBusy ? "busy" : "idle")}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: a.isBusy
                      ? "var(--green)"
                      : "var(--theme-focused-foreground-subdued, var(--dim))",
                  }}
                >
                  {a.isBusy ? "●" : "○"}
                </span>
                <span style={{ "font-weight": "500" }}>{a.paneTitle}</span>
                <Show when={a.isBusy && a.taskTitle}>
                  <span style={{ color: "var(--theme-focused-foreground-subdued, var(--dim))" }}>
                    · {a.taskTitle}
                  </span>
                </Show>
                <Show when={a.elapsed}>
                  <span
                    style={{
                      color: "var(--theme-focused-foreground-subdued, var(--dim))",
                      "font-variant-numeric": "tabular-nums",
                    }}
                  >
                    ({a.elapsed})
                  </span>
                </Show>
              </span>
            )}
          </For>
        </Show>
      </section>

      {/* Two-column body: milestones (left) + WIP + events (right) */}
      <div style={{ display: "flex", "flex-grow": "1", "min-height": "0", "min-width": "0" }}>
        {/* Milestones */}
        <div
          data-testid="v2-mc-milestones"
          style={{
            "min-width": "260px",
            flex: "1",
            "border-right": "1px solid var(--theme-border, var(--border))",
            "overflow-y": "auto",
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              color: "var(--theme-focused-foreground-subdued, var(--dim))",
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
              "font-size": "10px",
              "border-bottom": "1px solid var(--theme-border-subdued, var(--border-weak))",
            }}
          >
            Milestones
          </div>
          <Show
            when={milestones().length > 0}
            fallback={
              <div
                style={{
                  padding: "8px 12px",
                  color: "var(--theme-focused-foreground-subdued, var(--dim))",
                }}
              >
                — no milestones —
              </div>
            }
          >
            <For each={milestones()}>
              {(m, i) => {
                const isSel = () => i() === selectedMilestone();
                const isActive = () => activeMilestone()?.id === m.id;
                return (
                  <div
                    data-milestone-id={m.id}
                    style={{
                      padding: "4px 12px",
                      "border-left": isSel() ? "2px solid var(--accent)" : "2px solid transparent",
                      "background-color": isSel() ? "var(--surface-hover)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      "align-items": "center",
                      gap: "8px",
                    }}
                    onClick={() => setSelectedMilestone(i())}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        color: statusColor(m.status),
                        "font-family": "var(--font-mono)",
                        "font-weight": isActive() ? "700" : "400",
                      }}
                    >
                      {STATUS_GLYPH[m.status] ?? "·"}
                    </span>
                    <span
                      style={{
                        flex: "1",
                        "min-width": "0",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap",
                      }}
                    >
                      {m.title}
                    </span>
                    <span
                      style={{
                        color: "var(--theme-focused-foreground-subdued, var(--dim))",
                        "font-variant-numeric": "tabular-nums",
                        "font-size": "11px",
                      }}
                    >
                      {m.tasksDone}/{m.taskCount}
                    </span>
                    <span
                      style={{
                        "font-size": "10px",
                        "text-transform": "uppercase",
                        "letter-spacing": "0.05em",
                        color: statusColor(m.status),
                      }}
                    >
                      {m.status}
                    </span>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>

        {/* Right column: WIP tasks + recent events */}
        <div
          style={{
            flex: "1",
            "min-width": "0",
            "overflow-y": "auto",
            display: "flex",
            "flex-direction": "column",
          }}
        >
          <section data-testid="v2-mc-wip">
            <div
              style={{
                padding: "6px 12px",
                color: "var(--theme-focused-foreground-subdued, var(--dim))",
                "text-transform": "uppercase",
                "letter-spacing": "0.05em",
                "font-size": "10px",
                "border-bottom": "1px solid var(--theme-border-subdued, var(--border-weak))",
              }}
            >
              In flight ({wipTasks().length})
            </div>
            <Show
              when={wipTasks().length > 0}
              fallback={
                <div
                  style={{
                    padding: "8px 12px",
                    color: "var(--theme-focused-foreground-subdued, var(--dim))",
                  }}
                >
                  — nothing in flight —
                </div>
              }
            >
              <For each={wipTasks()}>
                {(t) => (
                  <div
                    style={{
                      padding: "3px 12px",
                      display: "flex",
                      gap: "8px",
                      "align-items": "center",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: statusColor(t.status), width: "1ch", "text-align": "center" }}
                    >
                      {STATUS_GLYPH[t.status] ?? "·"}
                    </span>
                    <span
                      style={{
                        "font-variant-numeric": "tabular-nums",
                        color: "var(--theme-focused-foreground-subdued, var(--dim))",
                        "font-size": "10px",
                      }}
                    >
                      {t.id}
                    </span>
                    <span
                      style={{
                        flex: "1",
                        "min-width": "0",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap",
                      }}
                    >
                      {t.title}
                    </span>
                    <Show when={t.assignee}>
                      <span style={{ color: "var(--cyan, var(--accent))", "font-size": "11px" }}>
                        @{t.assignee}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </section>

          <section data-testid="v2-mc-events" style={{ "flex-grow": "1" }}>
            <div
              style={{
                padding: "6px 12px",
                color: "var(--theme-focused-foreground-subdued, var(--dim))",
                "text-transform": "uppercase",
                "letter-spacing": "0.05em",
                "font-size": "10px",
                "border-top": "1px solid var(--theme-border-subdued, var(--border-weak))",
                "border-bottom": "1px solid var(--theme-border-subdued, var(--border-weak))",
              }}
            >
              Recent activity ({events().length})
            </div>
            <Show
              when={events().length > 0}
              fallback={
                <div
                  style={{
                    padding: "8px 12px",
                    color: "var(--theme-focused-foreground-subdued, var(--dim))",
                  }}
                >
                  — no recent events —
                </div>
              }
            >
              <For each={events().slice(0, 30)}>
                {(e) => (
                  <div
                    style={{
                      padding: "2px 12px",
                      display: "flex",
                      gap: "8px",
                      "font-size": "11px",
                    }}
                  >
                    <span
                      style={{
                        "font-variant-numeric": "tabular-nums",
                        color: "var(--theme-focused-foreground-subdued, var(--dim))",
                        "min-width": "32px",
                      }}
                    >
                      {e.relative ?? fmtRelative(e.timestamp)}
                    </span>
                    <span
                      style={{
                        color: statusColor(e.type.replace(/^task\./, "")),
                        "text-transform": "uppercase",
                        "font-size": "9px",
                        "letter-spacing": "0.05em",
                        "min-width": "60px",
                      }}
                    >
                      {e.type.replace(/^task\./, "")}
                    </span>
                    <Show when={e.agent}>
                      <span style={{ color: "var(--cyan, var(--accent))", "min-width": "8ch" }}>
                        {e.agent}
                      </span>
                    </Show>
                    <span
                      style={{
                        flex: "1",
                        "min-width": "0",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap",
                      }}
                    >
                      {e.message ?? ""}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </section>
        </div>
      </div>

      <footer
        style={{
          padding: "4px 12px",
          "border-top": "1px solid var(--theme-border-subdued, var(--border-weak))",
          color: "var(--theme-focused-foreground-subdued, var(--dim))",
          "font-size": "10px",
          "flex-shrink": "0",
        }}
      >
        j/k milestones · r refresh · polls 5s
      </footer>
    </div>
  );
}
