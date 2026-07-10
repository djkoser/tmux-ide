import { describe, it, expect } from "bun:test";
import { buildPaneCommand, collectPaneStartupPlan } from "./launch-plan.ts";
import type { Row } from "../types.ts";

describe("buildPaneCommand", () => {
  it("passes through normal pane commands", () => {
    expect(buildPaneCommand({ command: "pnpm dev" })).toBe("pnpm dev");
  });

  it("returns the command unchanged for Claude panes", () => {
    expect(buildPaneCommand({ command: "claude", role: "lead" })).toBe("claude");
    expect(buildPaneCommand({ command: "claude", role: "teammate", task: 'Fix "lint"' })).toBe(
      "claude",
    );
  });
});

describe("collectPaneStartupPlan", () => {
  it("launches team panes as normal pane commands", () => {
    const rows = [
      {
        panes: [
          { title: "Lead", command: "claude", role: "lead", focus: true, env: { PORT: 3000 } },
          { title: "Worker", command: "claude", role: "teammate", task: "Review" },
        ],
      },
      {
        panes: [{ title: "Shell", dir: "apps/web" }],
      },
    ];

    const result = collectPaneStartupPlan(
      rows,
      [["%1", "%2"], ["%3"]],
      new Set(["%1", "%3"]),
      "/workspace",
    );

    expect(result.focusPane).toBe("%1");
    expect(result.paneActions).toEqual([
      {
        targetPane: "%1",
        title: "Lead",
        chdir: null,
        exports: [`export 'PORT'='3000'`],
        command: `claude --name 'Lead' --append-system-prompt-file 'tmux-ide-scripts/boot/lead.md'`,
        widgetType: null,
        widgetTarget: null,
        paneRole: "lead",
        paneType: "agent",
      },
      {
        targetPane: "%2",
        title: "Worker",
        chdir: null,
        exports: [],
        command: `claude --name 'Worker' --append-system-prompt-file 'tmux-ide-scripts/boot/worker.md'`,
        widgetType: null,
        widgetTarget: null,
        paneRole: "teammate",
        paneType: "agent",
      },
      {
        targetPane: "%3",
        title: "Shell",
        chdir: "/workspace/apps/web",
        exports: [],
        command: null,
        widgetType: null,
        widgetTarget: null,
        paneRole: "shell",
        paneType: "shell",
      },
    ]);
  });

  it("auto-attaches a boot doc to team agent panes, skips solo panes and pre-wired commands", () => {
    const rows: Row[] = [
      {
        panes: [
          { title: "cw3", command: "claude", role: "teammate" },
          { title: "solo", command: "claude" }, // no role/task → untouched
          { title: "pre", command: "claude --append-system-prompt-file custom.md", role: "lead" },
        ],
      },
    ];

    const result = collectPaneStartupPlan(rows, [["%1", "%2", "%3"]], new Set(["%1"]), "/w");
    const cmd = Object.fromEntries(result.paneActions.map((a) => [a.title, a.command]));
    expect(cmd["cw3"]).toContain("--append-system-prompt-file 'tmux-ide-scripts/boot/cw3.md'");
    expect(cmd["solo"]).toBe("claude --name 'solo'"); // no boot doc for a role-less pane
    // already wired → not double-injected
    expect(cmd["pre"]!.match(/--append-system-prompt-file/g)!.length).toBe(1);
    expect(cmd["pre"]).toContain("custom.md");
  });

  it("preserves validator and researcher roles in @ide_role (not collapsed to shell)", () => {
    const rows: Row[] = [
      {
        panes: [
          { title: "validator", command: "claude", role: "validator" },
          { title: "researcher", command: "claude", role: "researcher" },
        ],
      },
    ];

    const result = collectPaneStartupPlan(rows, [["%1", "%2"]], new Set(["%1"]), "/workspace");
    expect(result.paneActions.map((a) => a.paneRole)).toEqual(["validator", "researcher"]);
    // still recognized as agent panes
    expect(result.paneActions.every((a) => a.paneType === "agent")).toBe(true);
  });

  it("widgets:false config produces fewer pane actions when widget panes are stripped", () => {
    const fullRows: Row[] = [
      {
        panes: [
          { title: "Claude", command: "claude", role: "lead" },
          { title: "Tasks", type: "tasks" },
          { title: "Explorer", type: "explorer" },
        ],
      },
      {
        panes: [{ title: "Shell" }, { title: "War Room", type: "warroom" }],
      },
    ];

    // Simulate headless mode: strip widget panes (panes with type set)
    const headlessRows = fullRows
      .map((row) => ({ ...row, panes: row.panes.filter((p) => !p.type) }))
      .filter((row) => row.panes.length > 0);

    const fullResult = collectPaneStartupPlan(
      fullRows,
      [
        ["%1", "%2", "%3"],
        ["%4", "%5"],
      ],
      new Set(["%1", "%4"]),
      "/workspace",
    );

    const headlessResult = collectPaneStartupPlan(
      headlessRows,
      [["%1"], ["%4"]],
      new Set(["%1", "%4"]),
      "/workspace",
    );

    // Full has 5 pane actions (3 widgets + agent + shell)
    expect(fullResult.paneActions.length).toBe(5);
    // Headless has only 2 (agent + shell), 3 widget panes stripped
    expect(headlessResult.paneActions.length).toBe(2);
    expect(headlessResult.paneActions.every((a) => a.widgetType === null)).toBeTruthy();
  });
});
