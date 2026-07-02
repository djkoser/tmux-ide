/**
 * Unit tests for the chrome updater's pure parts — the adopted-session parser
 * and the tick orchestration (with injected io, no live tmux).
 */
import { describe, expect, it, vi } from "vitest";
import { adoptedSessionsFrom, runUpdaterTick, updateSegment } from "./updater.ts";
import { buildStatusline } from "./statusline.ts";
import { DEFAULT_THEME } from "../../lib/app-config.ts";
import type { UpdateStatus } from "../../lib/update-check.ts";
import { paneChip } from "./chip.ts";
import type { AgentEventInit } from "./events.ts";
import type { AgentStatus } from "../detect/classify.ts";
import type { PaneDetail } from "../team/sessions.ts";
import type { TeamProject } from "../team/projects.ts";
import type { AttachedClient, ToastTarget } from "./notify.ts";

function project(name: string, overrides: Partial<TeamProject> = {}): TeamProject {
  return {
    name,
    dir: `/p/${name}`,
    hasIdeYml: false,
    gitBranch: null,
    registered: true,
    running: true,
    status: "idle",
    sessions: [{ name, attached: false, windows: 1, panes: 1, status: "idle", windowList: [] }],
    ...overrides,
  };
}

describe("adoptedSessionsFrom", () => {
  it("keeps only sessions whose marker field is exactly 1", () => {
    const lines = ["web\t1", "api\t", "db\t1", "scratch\t0"];
    expect(adoptedSessionsFrom(lines)).toEqual(["web", "db"]);
  });

  it("ignores blank / malformed lines", () => {
    expect(adoptedSessionsFrom(["", "web\t1", "\t1", "lonely"])).toEqual(["web"]);
  });

  it("returns [] for an empty fleet", () => {
    expect(adoptedSessionsFrom([])).toEqual([]);
  });
});

describe("runUpdaterTick", () => {
  it("writes each adopted session its own bar with that session flagged active", () => {
    const projects = [project("web"), project("api")];
    const writes: Array<[string, string]> = [];
    runUpdaterTick({
      listAdopted: () => ["web", "api"],
      computeProjects: () => projects,
      writeStatus: (session, value) => writes.push([session, value]),
    });

    expect(writes.map(([s]) => s)).toEqual(["web", "api"]);
    // Each session gets the bar computed with ITSELF as the active highlight.
    expect(writes[0]![1]).toBe(buildStatusline(projects, "web"));
    expect(writes[1]![1]).toBe(buildStatusline(projects, "api"));
    // The two bars differ precisely in which project is highlighted.
    expect(writes[0]![1]).not.toBe(writes[1]![1]);
  });

  it("computes the fleet ONCE per tick, not per session", () => {
    const computeProjects = vi.fn(() => [project("web")]);
    runUpdaterTick({
      listAdopted: () => ["web", "api", "db"],
      computeProjects,
      writeStatus: () => {},
    });
    expect(computeProjects).toHaveBeenCalledTimes(1);
  });

  it("does no work (no fleet scan, no writes) when nothing is adopted", () => {
    const computeProjects = vi.fn(() => []);
    const writeStatus = vi.fn();
    runUpdaterTick({ listAdopted: () => [], computeProjects, writeStatus });
    expect(computeProjects).not.toHaveBeenCalled();
    expect(writeStatus).not.toHaveBeenCalled();
  });

  it("appends the fleet's transitions to the injected event sink", () => {
    const appended: AgentEventInit[][] = [];
    const prevState = new Map<string, AgentStatus>([["web", "working"]]);
    runUpdaterTick({
      listAdopted: () => ["web"],
      // web changes working→done; api is seen for the first time.
      computeProjects: () => [
        project("web", {
          status: "done",
          sessions: [
            { name: "web", attached: false, windows: 1, panes: 1, status: "done", windowList: [] },
          ],
        }),
        project("api", {
          status: "working",
          sessions: [
            {
              name: "api",
              attached: false,
              windows: 1,
              panes: 1,
              status: "working",
              windowList: [],
            },
          ],
        }),
      ],
      writeStatus: () => {},
      prevState,
      appendEvents: (events) => appended.push(events),
    });

    expect(appended).toEqual([
      [
        { session: "web", from: "working", to: "done" },
        { session: "api", from: null, to: "working" },
      ],
    ]);
    // prevState was mutated in place to the fresh fleet state.
    expect(prevState.get("web")).toBe("done");
    expect(prevState.get("api")).toBe("working");
  });

  it("dispatches a toast when a session transitions to blocked", () => {
    const toasted: ToastTarget[][] = [];
    const clients: AttachedClient[] = [{ client: "/dev/ttys000", session: "other" }];
    const lastNotified = new Map<string, number>();
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: () => [
        project("web", {
          status: "blocked",
          sessions: [
            {
              name: "web",
              attached: false,
              windows: 1,
              panes: 1,
              status: "blocked",
              windowList: [],
            },
          ],
        }),
      ],
      writeStatus: () => {},
      prevState: new Map<string, AgentStatus>([["web", "working"]]),
      appendEvents: () => {},
      listClients: () => clients,
      lastNotified,
      now: () => 1000,
      prefs: { toast: true, macos: false },
      sendToasts: (t) => toasted.push(t),
      sendSystem: () => {},
    });

    expect(toasted).toEqual([[{ client: "/dev/ttys000", message: "⚠ web needs you (blocked)" }]]);
    // The debounce map was updated in place for the next tick.
    expect(lastNotified.get("web:blocked")).toBe(1000);
  });

  it("dispatches no toast for a working transition (only blocked/done notify)", () => {
    const sendToasts = vi.fn();
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: () => [
        project("web", {
          status: "working",
          sessions: [
            {
              name: "web",
              attached: false,
              windows: 1,
              panes: 1,
              status: "working",
              windowList: [],
            },
          ],
        }),
      ],
      writeStatus: () => {},
      prevState: new Map<string, AgentStatus>([["web", "idle"]]),
      appendEvents: () => {},
      listClients: () => [{ client: "c1", session: "other" }],
      lastNotified: new Map(),
      now: () => 1000,
      prefs: { toast: true, macos: false },
      sendToasts,
      sendSystem: vi.fn(),
    });
    expect(sendToasts).toHaveBeenCalledWith([]);
  });

  it("does not call the event sink when nothing transitioned", () => {
    const appendEvents = vi.fn();
    const prevState = new Map<string, AgentStatus>([["web", "idle"]]);
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: () => [project("web")], // status "idle" — unchanged
      writeStatus: () => {},
      prevState,
      appendEvents,
    });
    expect(appendEvents).not.toHaveBeenCalled();
  });
});

describe("runUpdaterTick — pane chips", () => {
  // A fake fleet scan that feeds fixed pane details through the tick's onPane.
  function withPanes(panes: PaneDetail[]) {
    return (onPane: (pane: PaneDetail) => void): TeamProject[] => {
      for (const pane of panes) onPane(pane);
      return [project("web")];
    };
  }

  it("writes each adopted pane its `agent · status` chip", () => {
    const writes: Array<[string, string]> = [];
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: withPanes([
        { sessionName: "web", paneId: "%1", agent: "claude", status: "working" },
        { sessionName: "web", paneId: "%2", agent: null, status: "idle" },
      ]),
      writeStatus: () => {},
      writeChip: (paneId, value) => writes.push([paneId, value]),
      chipCache: new Map(),
    });
    expect(writes).toEqual([
      ["%1", paneChip("claude", "working")],
      ["%2", ""], // non-agent pane → empty chip (border falls back to title)
    ]);
  });

  it("skips panes of non-adopted sessions", () => {
    const writeChip = vi.fn();
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: withPanes([
        { sessionName: "web", paneId: "%1", agent: "claude", status: "working" },
        { sessionName: "other", paneId: "%9", agent: "codex", status: "blocked" },
      ]),
      writeStatus: () => {},
      writeChip,
      chipCache: new Map(),
    });
    expect(writeChip).toHaveBeenCalledTimes(1);
    expect(writeChip).toHaveBeenCalledWith("%1", paneChip("claude", "working"));
  });

  it("only writes a chip when its value CHANGED (uses the per-pane cache)", () => {
    const writeChip = vi.fn();
    const chipCache = new Map<string, string>();
    const deps = {
      listAdopted: () => ["web"],
      computeProjects: withPanes([
        { sessionName: "web", paneId: "%1", agent: "claude", status: "working" as AgentStatus },
      ]),
      writeStatus: () => {},
      writeChip,
      chipCache,
    };
    runUpdaterTick(deps);
    runUpdaterTick(deps); // unchanged — must NOT rewrite
    expect(writeChip).toHaveBeenCalledTimes(1);
    expect(chipCache.get("%1")).toBe(paneChip("claude", "working"));
  });

  it("rewrites the chip when the pane's status changes", () => {
    const writeChip = vi.fn();
    const chipCache = new Map<string, string>();
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: withPanes([
        { sessionName: "web", paneId: "%1", agent: "claude", status: "working" },
      ]),
      writeStatus: () => {},
      writeChip,
      chipCache,
    });
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: withPanes([
        { sessionName: "web", paneId: "%1", agent: "claude", status: "blocked" },
      ]),
      writeStatus: () => {},
      writeChip,
      chipCache,
    });
    expect(writeChip).toHaveBeenCalledTimes(2);
    expect(writeChip).toHaveBeenLastCalledWith("%1", paneChip("claude", "blocked"));
  });

  it("does nothing without a writeChip/chipCache wired (bar-only callers)", () => {
    // No writeChip/chipCache — the tick still writes bars, just no chips.
    const writes: string[] = [];
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: withPanes([
        { sessionName: "web", paneId: "%1", agent: "claude", status: "working" },
      ]),
      writeStatus: (s) => writes.push(s),
    });
    expect(writes).toEqual(["web"]);
  });
});

describe("updateSegment", () => {
  it("renders a clickable `⬆ v<latest>` chip when an update is available", () => {
    const seg = updateSegment({ latest: "9.9.9", updateAvailable: true }, DEFAULT_THEME);
    expect(seg).toContain("⬆ v9.9.9");
    expect(seg).toContain(`#[fg=${DEFAULT_THEME.accent}]`);
    // wrapped in the `update` mouse range so the click router can float the popup
    expect(seg).toContain("#[range=user|update]");
    expect(seg).toContain("#[norange]");
  });

  it("is empty when no update is available (takes no space on the bar)", () => {
    expect(updateSegment({ latest: null, updateAvailable: false }, DEFAULT_THEME)).toBe("");
    expect(updateSegment({ latest: "2.6.0", updateAvailable: false }, DEFAULT_THEME)).toBe("");
  });
});

describe("runUpdaterTick — update surface", () => {
  const available: UpdateStatus = { latest: "9.9.9", updateAvailable: true };

  it("calls maybeCheckForUpdate once per tick and threads the segment into every bar", () => {
    const projects = [project("web"), project("api")];
    const check = vi.fn((): UpdateStatus => available);
    const writes: Array<[string, string]> = [];
    runUpdaterTick({
      listAdopted: () => ["web", "api"],
      computeProjects: () => projects,
      writeStatus: (s, v) => writes.push([s, v]),
      maybeCheckForUpdate: check,
    });
    expect(check).toHaveBeenCalledTimes(1);
    const extra = updateSegment(available, DEFAULT_THEME);
    // Each bar equals the buildStatusline with the update segment threaded in.
    expect(writes[0]![1]).toBe(buildStatusline(projects, "web", 12, DEFAULT_THEME, extra));
    expect(writes[1]![1]).toBe(buildStatusline(projects, "api", 12, DEFAULT_THEME, extra));
    expect(writes[0]![1]).toContain("⬆ v9.9.9");
  });

  it("threads NO segment when no update is available", () => {
    const projects = [project("web")];
    const writes: string[] = [];
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: () => projects,
      writeStatus: (_s, v) => writes.push(v),
      maybeCheckForUpdate: () => ({ latest: null, updateAvailable: false }),
    });
    expect(writes[0]).toBe(buildStatusline(projects, "web"));
    expect(writes[0]).not.toContain("⬆");
  });

  it("toasts every client once per version via markUpdateNotified", () => {
    const clients: AttachedClient[] = [
      { client: "/dev/ttys000", session: "web" },
      { client: "/dev/ttys001", session: "api" },
    ];
    const toasted: ToastTarget[][] = [];
    const notified = new Set<string>();
    const deps = {
      listAdopted: () => ["web"],
      computeProjects: () => [project("web")],
      writeStatus: () => {},
      maybeCheckForUpdate: (): UpdateStatus => available,
      // Mirrors the real markUpdateNotified: true the first time per version.
      markUpdateNotified: (v: string) => (notified.has(v) ? false : (notified.add(v), true)),
      listClients: () => clients,
      sendToasts: (t: ToastTarget[]) => toasted.push(t),
    };
    runUpdaterTick(deps);
    runUpdaterTick(deps); // second tick — already notified, no re-toast
    expect(toasted).toHaveLength(1);
    expect(toasted[0]).toEqual([
      { client: "/dev/ttys000", message: "⬆ tmux-ide v9.9.9 available — run: tmux-ide update" },
      { client: "/dev/ttys001", message: "⬆ tmux-ide v9.9.9 available — run: tmux-ide update" },
    ]);
  });

  it("suppresses the update toast when the toast pref is off", () => {
    const toasted: ToastTarget[][] = [];
    runUpdaterTick({
      listAdopted: () => ["web"],
      computeProjects: () => [project("web")],
      writeStatus: () => {},
      maybeCheckForUpdate: (): UpdateStatus => available,
      markUpdateNotified: () => true,
      listClients: () => [{ client: "/dev/ttys000", session: "web" }],
      sendToasts: (t) => toasted.push(t),
      prefs: { toast: false, macos: false },
    });
    expect(toasted).toHaveLength(0);
  });
});
