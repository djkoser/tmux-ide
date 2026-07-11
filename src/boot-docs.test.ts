import { describe, it, expect } from "bun:test";
import { generateBootDocs, claudePanes } from "./boot-docs.ts";
import type { IdeConfig } from "./types.ts";

const config = {
  name: "proj",
  team: { name: "dev-team" },
  rows: [
    { panes: [{ title: "team-input", command: "node repl.mjs" }] },
    {
      panes: [
        { title: "lead", command: "claude --model x", role: "lead", task: "Lead the team." },
        { title: "validator", command: "claude", role: "validator", task: "Validate." },
        {
          title: "cw3",
          command: "claude",
          role: "teammate",
          specialty: "implementation",
          task: "Implement dispatched tasks.",
        },
      ],
    },
  ],
} as unknown as IdeConfig;

describe("claudePanes", () => {
  it("selects only claude-command panes, excluding the node input pane", () => {
    expect(claudePanes(config).map((p) => p.title)).toEqual(["lead", "validator", "cw3"]);
  });
});

describe("generateBootDocs", () => {
  it("writes one doc per claude pane, slugged by title", () => {
    const docs = generateBootDocs(config);
    expect(docs.map((d) => d.slug)).toEqual(["lead", "validator", "cw3"]);
  });

  it("embeds the team name, full roster, and the pane's standing role", () => {
    const cw3 = generateBootDocs(config).find((d) => d.slug === "cw3")!;
    expect(cw3.content).toContain('"dev-team"');
    expect(cw3.content).toContain("- **lead** (lead)");
    expect(cw3.content).toContain("- **cw3** (teammate) — implementation");
    expect(cw3.content).toContain("Implement dispatched tasks.");
  });

  it("gives the lead dispatch-oriented coordination, teammates the notify path", () => {
    const docs = generateBootDocs(config);
    const lead = docs.find((d) => d.slug === "lead")!;
    const cw3 = docs.find((d) => d.slug === "cw3")!;
    expect(lead.content).toContain("Dispatch / message a teammate");
    expect(cw3.content).toContain("Notify the Lead");
  });

  it("falls back to config.name for the team label when no team block exists", () => {
    const noTeam = { ...config, team: undefined } as unknown as IdeConfig;
    expect(generateBootDocs(noTeam)[0]!.content).toContain('"proj"');
  });

  it("does not tell a teammate to run 'task done' (VAL-017: writers move to review)", () => {
    const cw3 = generateBootDocs(config).find((d) => d.slug === "cw3")!;
    expect(cw3.content).not.toContain("task done");
    expect(cw3.content).toContain("--status review");
    expect(cw3.content).toContain("only the reviewer can mark it done");
  });

  it("gives the reviewer/validator the task-done + reopen rights", () => {
    const validator = generateBootDocs(config).find((d) => d.slug === "validator")!;
    expect(validator.content).toContain("task done");
    expect(validator.content).toContain("ONLY role that marks a task done");
    expect(validator.content).toContain("tmux-ide task reopen");
  });
});
