import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Global EventSource stub installed by the Output-stream tests via
// `installEventSourceStub()`. The plain BottomPanel render mounts the
// OutputStream behind `display: none`, but its useEffect still runs and
// would throw `ReferenceError: EventSource is not defined` under jsdom.
// A no-op default keeps every other test happy.
class NoopEventSource {
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
  }
  close() {
    this.closed = true;
  }
  addEventListener() {}
  removeEventListener() {}
}
(globalThis as { EventSource: unknown }).EventSource =
  NoopEventSource as unknown as typeof EventSource;

import {
  BottomPanel,
  type OutputChannel,
  type ProblemEntry,
} from "../BottomPanel";

// The xterm Terminal component pulls webgl + DOM apis we don't care about in
// this unit test; stub it to a marker element so we can assert mount state.
vi.mock("@/components/Terminal", () => ({
  Terminal: ({ id }: { id: string }) => (
    <div data-testid="terminal-stub" data-terminal-id={id}>
      terminal:{id}
    </div>
  ),
}));

beforeEach(() => {
  window.localStorage.clear();
});

describe("BottomPanel", () => {
  it("defaults to the terminal tab and hides Problems / Output", () => {
    render(<BottomPanel projectName="demo" />);
    const panel = screen.getByTestId("bottom-panel");
    expect(panel.getAttribute("data-active-tab")).toBe("terminal");
    expect(screen.getByTestId("terminal-stub").getAttribute("data-terminal-id")).toBe(
      "v2-bottom-demo",
    );
    // Hidden panels use display: none, not unmount — the marker is still
    // in the DOM so the terminal survives tab switches.
    expect(screen.getByTestId("bottom-panel-problems").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("bottom-panel-output").getAttribute("aria-hidden")).toBe("true");
  });

  it("switches tabs and keeps the Terminal mounted (host pattern)", () => {
    render(<BottomPanel projectName="demo" />);
    const terminalBefore = screen.getByTestId("terminal-stub");

    fireEvent.click(screen.getByTestId("bottom-panel-tab-problems"));
    expect(screen.getByTestId("bottom-panel").getAttribute("data-active-tab")).toBe("problems");
    expect(screen.getByTestId("bottom-panel-terminal").getAttribute("aria-hidden")).toBe("true");

    // Identity check — same DOM node, not a re-mount. xterm's WebSocket +
    // scrollback live across the tab swap.
    fireEvent.click(screen.getByTestId("bottom-panel-tab-terminal"));
    const terminalAfter = screen.getByTestId("terminal-stub");
    expect(terminalAfter).toBe(terminalBefore);
  });

  it("renders the problems list and shows the badge count", () => {
    const problems: ProblemEntry[] = [
      {
        severity: "error",
        file: "src/foo.ts",
        line: 10,
        column: 4,
        message: "Type 'string' is not assignable to 'number'.",
        source: "ts",
      },
      {
        severity: "warning",
        file: "src/bar.tsx",
        message: "Unused variable 'x'",
        source: "eslint",
      },
    ];
    render(<BottomPanel projectName="demo" problems={problems} />);
    const badge = screen.getByTestId("bottom-panel-problems-badge");
    expect(badge.textContent).toBe("2");

    fireEvent.click(screen.getByTestId("bottom-panel-tab-problems"));
    const list = screen.getByTestId("bottom-panel-problems-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("src/foo.ts");
    expect(items[0].textContent).toContain("10:4");
    expect(items[0].textContent).toContain("Type 'string' is not assignable to 'number'.");
    expect(within(list).getByTestId("problem-dot-error")).not.toBeNull();
    expect(within(list).getByTestId("problem-dot-warning")).not.toBeNull();
  });

  it("renders zero state when there are no problems", () => {
    render(<BottomPanel projectName="demo" />);
    expect(screen.queryByTestId("bottom-panel-problems-badge")).toBeNull();
    fireEvent.click(screen.getByTestId("bottom-panel-tab-problems"));
    expect(screen.getByTestId("bottom-panel-problems").textContent).toContain(
      "No problems detected.",
    );
  });

  it("switches output channels via the picker", () => {
    const channels: OutputChannel[] = [
      { id: "daemon-log", label: "Daemon" },
      { id: "hq-log", label: "HQ" },
      { id: "custom", label: "Custom" },
    ];
    render(<BottomPanel projectName="demo" outputChannels={channels} />);
    fireEvent.click(screen.getByTestId("bottom-panel-tab-output"));

    const picker = screen.getByTestId("bottom-panel-output-channel") as HTMLSelectElement;
    expect(picker.value).toBe("daemon-log");
    // First channel has no streamUrl → "not yet plumbed" placeholder.
    expect(screen.getByTestId("bottom-panel-output").textContent).toContain("not yet plumbed");

    fireEvent.change(picker, { target: { value: "hq-log" } });
    expect((picker as HTMLSelectElement).value).toBe("hq-log");
    expect(screen.getByTestId("bottom-panel-output").textContent).toContain("HQ");
  });
});

// ---------------------------------------------------------------------------
// Output stream — EventSource lifecycle + Clear + Pause
// ---------------------------------------------------------------------------

describe("BottomPanel Output stream", () => {
  type Listener = (ev: { data: string }) => void;
  interface StubSource {
    url: string;
    closed: boolean;
    listeners: Map<string, Set<Listener>>;
    onmessage: Listener | null;
    onerror: ((ev: Event) => void) | null;
    close(): void;
    addEventListener(type: string, fn: Listener): void;
    removeEventListener(type: string, fn: Listener): void;
    emit(type: string, data: string): void;
  }
  let opened: StubSource[] = [];

  beforeEach(() => {
    opened = [];
    (globalThis as { EventSource: unknown }).EventSource = class {
      url: string;
      closed = false;
      listeners = new Map<string, Set<Listener>>();
      onmessage: Listener | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor(url: string) {
        this.url = url;
        opened.push(this as unknown as StubSource);
      }
      close() {
        this.closed = true;
      }
      addEventListener(type: string, fn: Listener) {
        let bucket = this.listeners.get(type);
        if (!bucket) {
          bucket = new Set();
          this.listeners.set(type, bucket);
        }
        bucket.add(fn);
      }
      removeEventListener(type: string, fn: Listener) {
        this.listeners.get(type)?.delete(fn);
      }
      emit(type: string, data: string) {
        const bucket = this.listeners.get(type);
        if (bucket) for (const fn of bucket) fn({ data });
        if (type === "message" && this.onmessage) this.onmessage({ data });
      }
    } as unknown as typeof EventSource;
  });

  afterEach(() => {
    // Restore the file-level no-op stub.
    (globalThis as { EventSource: unknown }).EventSource =
      NoopEventSource as unknown as typeof EventSource;
  });

  function openOutput(channelOverride?: OutputChannel) {
    const channels: OutputChannel[] = [
      channelOverride ?? {
        id: "daemon-log",
        label: "Daemon",
        streamUrl: "http://x/api/logs/daemon",
      },
    ];
    const utils = render(<BottomPanel projectName="demo" outputChannels={channels} />);
    fireEvent.click(screen.getByTestId("bottom-panel-tab-output"));
    return utils;
  }

  it("opens an EventSource when the Output tab activates a streamed channel", () => {
    openOutput();
    expect(opened).toHaveLength(1);
    expect(opened[0].url).toBe("http://x/api/logs/daemon");
    expect(opened[0].closed).toBe(false);
  });

  it("renders streamed log entries with level + component", () => {
    openOutput();
    act(() =>
      opened[0].emit(
        "entry",
        JSON.stringify({
          ts: "2026-05-13T10:11:12.000Z",
          level: "warn",
          component: "watchdog",
          msg: "respawning daemon",
        }),
      ),
    );
    const stream = screen.getByTestId("bottom-panel-output-stream");
    expect(stream.textContent).toContain("10:11:12");
    expect(stream.textContent).toContain("warn");
    expect(stream.textContent).toContain("watchdog");
    expect(stream.textContent).toContain("respawning daemon");
  });

  it("Clear button drops the visible buffer", () => {
    openOutput();
    act(() =>
      opened[0].emit(
        "entry",
        JSON.stringify({ level: "info", component: "daemon", msg: "tick" }),
      ),
    );
    expect(screen.getByTestId("bottom-panel-output-stream").textContent).toContain("tick");
    fireEvent.click(screen.getByTestId("bottom-panel-output-clear"));
    expect(screen.getByTestId("bottom-panel-output-stream").textContent).toContain(
      "Waiting for data",
    );
  });

  it("Pause stops appending; Resume flushes pending entries", () => {
    openOutput();
    fireEvent.click(screen.getByTestId("bottom-panel-output-pause"));
    act(() =>
      opened[0].emit(
        "entry",
        JSON.stringify({ level: "info", component: "daemon", msg: "first" }),
      ),
    );
    act(() =>
      opened[0].emit(
        "entry",
        JSON.stringify({ level: "info", component: "daemon", msg: "second" }),
      ),
    );
    // Paused → not visible.
    expect(screen.getByTestId("bottom-panel-output-stream").textContent).not.toContain("first");
    // Resume → drained.
    fireEvent.click(screen.getByTestId("bottom-panel-output-pause"));
    const stream = screen.getByTestId("bottom-panel-output-stream");
    expect(stream.textContent).toContain("first");
    expect(stream.textContent).toContain("second");
    // EventSource was NOT recreated by the pause/resume toggle.
    expect(opened).toHaveLength(1);
  });

  it("closes the EventSource when the channel switches", () => {
    const channels: OutputChannel[] = [
      { id: "daemon-log", label: "Daemon", streamUrl: "http://x/api/logs/daemon" },
      { id: "hq-log", label: "HQ", streamUrl: "http://x/api/logs/hq" },
    ];
    render(<BottomPanel projectName="demo" outputChannels={channels} />);
    fireEvent.click(screen.getByTestId("bottom-panel-tab-output"));
    expect(opened).toHaveLength(1);
    const first = opened[0];
    expect(first.closed).toBe(false);
    fireEvent.change(screen.getByTestId("bottom-panel-output-channel"), {
      target: { value: "hq-log" },
    });
    expect(first.closed).toBe(true);
    expect(opened).toHaveLength(2);
    expect(opened[1].url).toBe("http://x/api/logs/hq");
  });
});
