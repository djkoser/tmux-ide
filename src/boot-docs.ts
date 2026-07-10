import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { readConfig } from "./lib/yaml-io.ts";
import { slugify } from "./lib/slugify.ts";
import type { IdeConfig, Pane } from "./types.ts";

/**
 * Per-pane team-awareness boot docs generated from ide.yml.
 *
 * tmux-ide does not deliver a pane's `task:` (its standing role contract) to
 * the agent it spawns, nor tell teammates they are on a team — only the Lead
 * gets an injected prompt. Each pane references its generated doc via
 * `claude --append-system-prompt-file`, so every agent boots knowing the team,
 * its role, and how to coordinate. `task:` stays the single source of truth;
 * these docs are derived and regenerated on every launch/restart.
 *
 * Native replacement for gen-boot-docs.mjs — reads the config directly instead
 * of shelling out to `tmux-ide config --json`.
 */

export interface BootDoc {
  title: string;
  slug: string;
  content: string;
}

/** The claude-command panes are the agents that receive a boot doc. */
export function claudePanes(config: IdeConfig): Pane[] {
  return (config.rows ?? [])
    .flatMap((r) => r.panes ?? [])
    .filter((p) => typeof p.command === "string" && /^claude(\s|$)/.test(p.command.trim()));
}

export function generateBootDocs(config: IdeConfig): BootDoc[] {
  const teamName = config.team?.name ?? config.name ?? "this";
  const panes = claudePanes(config);
  const roster = panes
    .map((p) => `- **${p.title}** (${p.role ?? "teammate"})${p.specialty ? ` — ${p.specialty}` : ""}`)
    .join("\n");

  return panes.map((p) => {
    const isLead = p.role === "lead";
    const coordination = isLead
      ? `- Dispatch / message a teammate: \`tmux-ide send --to "<title>" "message"\`\n- Inspect tasks: \`tmux-ide task list --json\` · \`tmux-ide task show <id> --json\``
      : `- Message a teammate: \`tmux-ide send --to "<title>" "message"\`\n- Notify the Lead: \`tmux-ide notify "message"\`\n- The orchestrator may hand you a task via \`tmux-ide dispatch <id>\`; finish with \`tmux-ide task done <id> --proof "..."\``;

    const content = `You are **${p.title}** in the "${teamName}" tmux-ide agent team — a coordinated multi-agent Claude Code session running in side-by-side tmux panes. You are NOT working alone; coordinate with your teammates, do not duplicate their work, and stay within your role.

## Team roster
${roster}

## Coordinating
${coordination}

## Your standing role
${p.task ?? "(no standing role defined for this pane)"}
`;

    return { title: p.title ?? "", slug: slugify(p.title ?? "pane"), content };
  });
}

export async function bootDocs(
  targetDir: string | undefined,
  opts: { out?: string; json?: boolean } = {},
): Promise<void> {
  const dir = resolve(targetDir ?? ".");
  const { config } = readConfig(dir);
  const outDir = resolve(dir, opts.out ?? "tmux-ide-scripts/boot");
  mkdirSync(outDir, { recursive: true });

  const docs = generateBootDocs(config);
  for (const d of docs) writeFileSync(join(outDir, `${d.slug}.md`), d.content);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, outDir, wrote: docs.map((d) => `${d.slug}.md`) }, null, 2));
  } else {
    console.log(`boot-docs: wrote ${docs.length} boot doc(s) to ${outDir}`);
  }
}
