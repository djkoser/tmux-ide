import { createSignal, createMemo, For, Show, onCleanup, onMount } from "solid-js";
import { fetchMetrics, type MetricsData } from "../api";
import type { BaseMountOptions } from "../types";

interface CostsViewProps {
  options: () => BaseMountOptions;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function formatPct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

export function CostsView(props: CostsViewProps) {
  const [data, setData] = createSignal<MetricsData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedRow, setSelectedRow] = createSignal(-1);

  async function refresh() {
    try {
      const d = await fetchMetrics(props.options());
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  onMount(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    onCleanup(() => clearInterval(interval));
  });

  // Keyboard navigation — j/k or arrow keys move selection, r refreshes
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      const rows = data()?.agents ?? [];
      if (e.key === "j" || e.key === "ArrowDown") {
        setSelectedRow((i) => Math.min(rows.length - 1, i + 1));
        e.preventDefault();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        setSelectedRow((i) => Math.max(0, i - 1));
        e.preventDefault();
      } else if (e.key === "r") {
        void refresh();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  const sortedAgents = createMemo(() => {
    const d = data();
    if (!d) return [];
    return [...d.agents].sort((a, b) => b.totalTimeMs - a.totalTimeMs);
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
      {/* Header */}
      <header
        style={{
          padding: "8px 12px",
          "border-bottom": "1px solid var(--theme-border, var(--border))",
          "flex-shrink": "0",
        }}
      >
        <div style={{ "font-weight": "500", "margin-bottom": "4px" }}>Session Costs</div>
        <Show when={data()} fallback={<div style={{ color: "var(--theme-focused-foreground-subdued, var(--dim))" }}>… loading</div>}>
          {(d) => (
            <div style={{ display: "flex", gap: "16px", color: "var(--theme-focused-foreground-subdued, var(--dim))", "font-size": "11px" }}>
              <span>Elapsed: {formatDurationMs(d().sessionElapsedMs)}</span>
              <span>Agent time: {formatDurationMs(d().totalTimeMs)}</span>
              <span>Tasks: {d().totalTasks}</span>
            </div>
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

      {/* Agent table */}
      <div style={{ "flex-grow": "1", "overflow-y": "auto", "min-height": "0" }}>
        <Show
          when={sortedAgents().length > 0}
          fallback={
            <div style={{ padding: "12px", color: "var(--theme-focused-foreground-subdued, var(--dim))" }}>
              — no task activity recorded yet —
            </div>
          }
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              "grid-template-columns": "1fr 60px 100px 100px 70px",
              gap: "8px",
              padding: "6px 12px",
              "border-bottom": "1px solid var(--theme-border-subdued, var(--border-weak))",
              color: "var(--theme-focused-foreground-subdued, var(--dim))",
              "font-size": "10px",
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
            }}
          >
            <span>Agent</span>
            <span style={{ "text-align": "right" }}>Tasks</span>
            <span style={{ "text-align": "right" }}>Total</span>
            <span style={{ "text-align": "right" }}>Avg/task</span>
            <span style={{ "text-align": "right" }}>Util</span>
          </div>

          <For each={sortedAgents()}>
            {(agent, i) => (
              <div
                style={{
                  display: "grid",
                  "grid-template-columns": "1fr 60px 100px 100px 70px",
                  gap: "8px",
                  padding: "4px 12px",
                  "border-left":
                    i() === selectedRow()
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  "background-color":
                    i() === selectedRow() ? "var(--surface-hover)" : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedRow(i())}
              >
                <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                  {agent.name}
                </span>
                <span style={{ "text-align": "right", "font-variant-numeric": "tabular-nums" }}>
                  {agent.taskCount}
                </span>
                <span style={{ "text-align": "right", "font-variant-numeric": "tabular-nums" }}>
                  {formatDurationMs(agent.totalTimeMs)}
                </span>
                <span style={{ "text-align": "right", "font-variant-numeric": "tabular-nums" }}>
                  {agent.taskCount > 0 ? formatDurationMs(agent.totalTimeMs / agent.taskCount) : "—"}
                </span>
                <span style={{ "text-align": "right", "font-variant-numeric": "tabular-nums" }}>
                  {formatPct(agent.utilization)}
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* Footer hint */}
      <footer
        style={{
          padding: "4px 12px",
          "border-top": "1px solid var(--theme-border-subdued, var(--border-weak))",
          color: "var(--theme-focused-foreground-subdued, var(--dim))",
          "font-size": "10px",
          "flex-shrink": "0",
        }}
      >
        j/k navigate · r refresh
      </footer>
    </div>
  );
}
