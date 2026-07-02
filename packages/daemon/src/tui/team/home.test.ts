import { describe, it, expect } from "vitest";
import type { TeamProject } from "./projects.ts";
import type { TeamSession } from "./sessions.ts";
import type { AgentStatus } from "../detect/classify.ts";
import { GRAMMAR_KEYS } from "../../widgets/lib/grammar.ts";
import { PANEL_POPUPS } from "../chrome/panels.ts";
import {
  fleetRollup,
  rollupChips,
  ROLLUP_ORDER,
  isFleetEmpty,
  emptyFleetActions,
  panelForKey,
  keyForPanel,
  HOME_PANEL_KEYS,
  panelHints,
  homeFooterHints,
  pickerFooterHints,
} from "./home.ts";

function session(name: string, status: AgentStatus): TeamSession {
  return { name, attached: false, windows: 1, panes: 1, status, windowList: [] };
}

function project(name: string, sessions: TeamSession[]): TeamProject {
  return {
    name,
    dir: `/tmp/${name}`,
    hasIdeYml: false,
    gitBranch: null,
    registered: true,
    running: sessions.length > 0,
    status: sessions[0]?.status ?? "idle",
    sessions,
  };
}

describe("fleetRollup", () => {
  it("tallies every session's status across projects", () => {
    const projects = [
      project("a", [session("a1", "working"), session("a2", "blocked")]),
      project("b", [session("b1", "working"), session("b2", "done")]),
      project("c", []),
    ];
    const r = fleetRollup(projects);
    expect(r.working).toBe(2);
    expect(r.blocked).toBe(1);
    expect(r.done).toBe(1);
    expect(r.idle).toBe(0);
    expect(r.sessions).toBe(4);
    expect(r.projects).toBe(3);
  });

  it("is all zeros for an empty fleet", () => {
    const r = fleetRollup([]);
    expect(r.sessions).toBe(0);
    expect(r.projects).toBe(0);
    expect(rollupChips(r).every((c) => c.count === 0)).toBe(true);
  });
});

describe("rollupChips", () => {
  it("returns chips in severity order matching ROLLUP_ORDER", () => {
    const chips = rollupChips(fleetRollup([project("a", [session("a1", "done")])]));
    expect(chips.map((c) => c.status)).toEqual(ROLLUP_ORDER);
    expect(chips.find((c) => c.status === "done")!.count).toBe(1);
  });
});

describe("isFleetEmpty", () => {
  it("is true only when there are no projects at all", () => {
    expect(isFleetEmpty([])).toBe(true);
    expect(isFleetEmpty([project("a", [])])).toBe(false);
    expect(isFleetEmpty([project("a", [session("a1", "idle")])])).toBe(false);
  });
});

describe("emptyFleetActions", () => {
  it("offers new / launch / quit", () => {
    expect(emptyFleetActions().map((a) => a.key)).toEqual(["n", "l", "q"]);
  });
});

describe("panel keys", () => {
  it("maps e/g/, to explorer/changes/config", () => {
    expect(panelForKey("e")).toBe("explorer");
    expect(panelForKey("g")).toBe("changes");
    expect(panelForKey(",")).toBe("config");
    expect(panelForKey("z")).toBeNull();
  });

  it("round-trips key <-> panel", () => {
    for (const [key, widget] of Object.entries(HOME_PANEL_KEYS)) {
      expect(keyForPanel(widget)).toBe(key);
    }
  });

  it("binds a key for every registered panel", () => {
    for (const p of PANEL_POPUPS) {
      expect(keyForPanel(p.widget)).not.toBe("");
    }
  });
});

describe("panelHints", () => {
  it("derives one hint per registered panel, terse name for the footer", () => {
    const hints = panelHints("widget");
    expect(hints.map((h) => h.label)).toEqual(PANEL_POPUPS.map((p) => p.widget));
    expect(hints.map((h) => h.keys)).toEqual(PANEL_POPUPS.map((p) => keyForPanel(p.widget)));
  });

  it("uses the registry label in help mode", () => {
    expect(panelHints("label").map((h) => h.label)).toEqual(PANEL_POPUPS.map((p) => p.label));
  });
});

describe("homeFooterHints", () => {
  it("sources filter/help/quit key glyphs from the grammar constants", () => {
    const hints = homeFooterHints();
    const byLabel = (label: string) => hints.find((h) => h.label === label)!;
    expect(byLabel("filter").keys).toBe(GRAMMAR_KEYS.filter[0]);
    expect(byLabel("help").keys).toBe(GRAMMAR_KEYS.help[0]);
    expect(byLabel("quit").keys).toBe(GRAMMAR_KEYS.quit[0]);
  });

  it("includes every panel hint", () => {
    const labels = homeFooterHints().map((h) => h.label);
    for (const p of PANEL_POPUPS) expect(labels).toContain(p.widget);
  });
});

describe("pickerFooterHints", () => {
  it("advertises switch/launch/find/help/close, with the discoverable keys from the grammar", () => {
    const hints = pickerFooterHints();
    const byLabel = (label: string) => hints.find((h) => h.label === label)!;
    // the picker ends in a switch-client + close
    expect(byLabel("switch").keys).toBe("↵");
    expect(byLabel("close").keys).toBe("esc");
    // filter + help keys are sourced from the grammar so they can't drift
    expect(byLabel("find").keys).toBe(GRAMMAR_KEYS.filter[0]);
    expect(byLabel("help").keys).toBe(GRAMMAR_KEYS.help[0]);
  });
});
