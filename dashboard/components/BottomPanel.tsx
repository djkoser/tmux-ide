"use client";

/**
 * BottomPanel — VSCode-style tabbed strip with three tabs:
 *   - Terminal: the xterm-backed `<Terminal>` component (always-mounted via
 *     a "host" pattern so switching tabs doesn't tear down the WebSocket
 *     or lose the scrollback)
 *   - Problems: aggregated TS / lint / daemon errors (stub: zero state)
 *   - Output: log-channel viewer (stub: channel picker + placeholder)
 *
 * Architectural choice: built as React rather than a Solid silo. The
 * panel embeds `<Terminal>` (React/xterm) and the rest is chrome + text
 * — no perf-critical reactive surface that would benefit from Solid
 * signals. The task brief explicitly authorized this fallback ("if
 * that's gnarly, build it as a pure React component").
 *
 * Fixes the "bottom terminal isn't working" complaint at the source:
 * `ProjectV2Page.tsx`'s `TerminalPane` rendered fake ASCII text instead
 * of the real `<Terminal>` component. Wiring is left to the shell
 * refactor (pane 1) — this commit only ships the composite.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@/components/Terminal";

export type BottomPanelTab = "terminal" | "problems" | "output";

export interface BottomPanelProps {
  /** Project / session name. Threaded into the terminal id so each project
   *  gets its own persistent PTY. */
  projectName: string;
  /** Optional initial tab. Defaults to "terminal". */
  initialTab?: BottomPanelTab;
  /** Aggregated problem list. The shell owns the data source (typecheck
   *  / lint poll). Omit for a "no problems detected" state. */
  problems?: ReadonlyArray<ProblemEntry>;
  /** Output channels to expose in the picker. Omit for the default set. */
  outputChannels?: ReadonlyArray<OutputChannel>;
  /** Optional override for the terminal id. Defaults to `v2-bottom-${projectName}`. */
  terminalId?: string;
}

export interface ProblemEntry {
  /** "error" / "warning" / "info" — controls the dot color. */
  severity: "error" | "warning" | "info";
  /** Workspace-relative file path. */
  file: string;
  /** Optional line + column. */
  line?: number;
  column?: number;
  /** Human-readable problem text. */
  message: string;
  /** Source ("ts", "eslint", "daemon", "vitest", …). */
  source?: string;
}

export interface OutputChannel {
  /** Stable id used in the picker. */
  id: string;
  /** Display label. */
  label: string;
  /** Optional SSE URL — when omitted the channel shows "not yet plumbed". */
  streamUrl?: string;
}

const DEFAULT_CHANNELS: ReadonlyArray<OutputChannel> = [
  { id: "daemon-log", label: "Daemon" },
  { id: "hq-log", label: "HQ" },
  { id: "watchdog-log", label: "Watchdog" },
  { id: "command-center", label: "Command center" },
];

export function BottomPanel({
  projectName,
  initialTab = "terminal",
  problems,
  outputChannels = DEFAULT_CHANNELS,
  terminalId,
}: BottomPanelProps) {
  const [active, setActive] = useState<BottomPanelTab>(initialTab);
  const resolvedTerminalId = terminalId ?? `v2-bottom-${projectName}`;

  const problemCount = problems?.length ?? 0;

  return (
    <section
      data-testid="bottom-panel"
      data-active-tab={active}
      className="flex h-full min-h-0 flex-col bg-[var(--bg)] text-foreground"
    >
      <TabBar
        active={active}
        onSelect={setActive}
        problemCount={problemCount}
      />

      {/* Each tab content is always mounted; visibility is toggled via
       *  CSS so the Terminal (xterm + WebSocket) survives tab switches.
       *  Switching to Problems or Output never tears down the PTY. */}
      <div className="relative min-h-0 flex-1">
        <TabPanel hidden={active !== "terminal"} testId="bottom-panel-terminal">
          <Terminal id={resolvedTerminalId} showHeader={false} />
        </TabPanel>
        <TabPanel hidden={active !== "problems"} testId="bottom-panel-problems">
          <ProblemsView problems={problems} />
        </TabPanel>
        <TabPanel hidden={active !== "output"} testId="bottom-panel-output">
          <OutputView channels={outputChannels} />
        </TabPanel>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  active: BottomPanelTab;
  onSelect: (tab: BottomPanelTab) => void;
  problemCount: number;
}

function TabBar({ active, onSelect, problemCount }: TabBarProps) {
  return (
    <div
      data-testid="bottom-panel-tabs"
      // 30px tab strip per task brief.
      className="flex h-[30px] shrink-0 items-center gap-1 border-b border-border bg-[var(--bg-strong)] px-2 text-[11px] uppercase tracking-wider"
      role="tablist"
      aria-label="Bottom panel tabs"
    >
      <TabButton
        id="terminal"
        label="Terminal"
        active={active === "terminal"}
        onClick={() => onSelect("terminal")}
      />
      <TabButton
        id="problems"
        label="Problems"
        active={active === "problems"}
        onClick={() => onSelect("problems")}
        badge={problemCount > 0 ? problemCount : undefined}
      />
      <TabButton
        id="output"
        label="Output"
        active={active === "output"}
        onClick={() => onSelect("output")}
      />
    </div>
  );
}

interface TabButtonProps {
  id: BottomPanelTab;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

function TabButton({ id, label, active, onClick, badge }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      data-testid={`bottom-panel-tab-${id}`}
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 transition-colors ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      {typeof badge === "number" && (
        <span
          data-testid={`bottom-panel-${id}-badge`}
          className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] tabular-nums text-destructive-foreground"
        >
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px h-px bg-[var(--accent)]"
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab panel — always-mounted with CSS visibility for state preservation
// ---------------------------------------------------------------------------

interface TabPanelProps {
  hidden: boolean;
  testId: string;
  children: React.ReactNode;
}

function TabPanel({ hidden, testId, children }: TabPanelProps) {
  return (
    <div
      data-testid={testId}
      role="tabpanel"
      aria-hidden={hidden}
      // `hidden` removes the panel from layout; we use `display: none`
      // instead so xterm's ResizeObserver doesn't see a 0×0 host and
      // shrink the buffer to 1×1 (xterm refuses to fit a zero-sized
      // container). When the tab becomes active again the buffer
      // re-fits to the host's current size.
      className="absolute inset-0 flex min-h-0 flex-col"
      style={hidden ? { display: "none" } : undefined}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Problems tab
// ---------------------------------------------------------------------------

function ProblemsView({ problems }: { problems?: ReadonlyArray<ProblemEntry> }) {
  if (!problems || problems.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
        No problems detected.
      </div>
    );
  }
  return (
    <ul
      data-testid="bottom-panel-problems-list"
      className="flex-1 overflow-auto divide-y divide-border/45 font-mono"
    >
      {problems.map((p, i) => (
        <li
          key={`${p.file}:${p.line ?? 0}:${p.column ?? 0}:${i}`}
          className="flex items-start gap-2 px-3 py-1.5 text-[11px] hover:bg-[var(--surface-hover)]"
        >
          <ProblemDot severity={p.severity} />
          <span className="flex-1 truncate">
            <span className="text-foreground">{p.file}</span>
            {p.line ? (
              <span className="text-muted-foreground">
                :{p.line}
                {p.column ? `:${p.column}` : ""}
              </span>
            ) : null}
            <span className="ml-2 text-foreground">{p.message}</span>
          </span>
          {p.source && (
            <span className="rounded-sm bg-[var(--surface)] px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {p.source}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProblemDot({ severity }: { severity: ProblemEntry["severity"] }) {
  const cls =
    severity === "error"
      ? "bg-destructive"
      : severity === "warning"
        ? "bg-warning"
        : "bg-info";
  return (
    <span
      data-testid={`problem-dot-${severity}`}
      aria-hidden="true"
      className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Output tab — channel picker + log stream
// ---------------------------------------------------------------------------

function OutputView({ channels }: { channels: ReadonlyArray<OutputChannel> }) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");
  const current = useMemo(
    () => channels.find((c) => c.id === channelId) ?? channels[0],
    [channels, channelId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-border/45 bg-[var(--bg-strong)] px-3 text-[10px]">
        <span className="text-muted-foreground">Channel</span>
        <select
          data-testid="bottom-panel-output-channel"
          value={channelId}
          onChange={(e) => setChannelId(e.currentTarget.value)}
          className="rounded-sm border border-input bg-[var(--surface)] px-1 py-px text-[11px] text-foreground focus:border-[var(--accent)] focus:outline-none"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-muted-foreground">{current?.label}</span>
      </div>
      {current ? (
        <OutputStream channel={current} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No channels configured.
        </div>
      )}
    </div>
  );
}

function OutputStream({ channel }: { channel: OutputChannel }) {
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    setLines([]);
    if (!channel.streamUrl) return;
    const source = new EventSource(channel.streamUrl);
    source.onmessage = (ev) => {
      setLines((prev) => [...prev.slice(-499), String(ev.data)]);
    };
    source.onerror = () => {
      setLines((prev) => [...prev, `[stream error: ${channel.id}]`]);
    };
    return () => source.close();
  }, [channel.id, channel.streamUrl]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!channel.streamUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Channel <span className="mx-1 text-foreground">{channel.label}</span> not yet plumbed.
        Provide an SSE URL via the `outputChannels` prop to enable streaming.
      </div>
    );
  }

  return (
    <pre
      ref={scrollRef}
      data-testid="bottom-panel-output-stream"
      className="flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-snug text-foreground"
    >
      {lines.length === 0 ? (
        <span className="text-muted-foreground">Waiting for data…</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {line}
          </div>
        ))
      )}
    </pre>
  );
}
