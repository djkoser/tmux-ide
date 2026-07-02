/**
 * `tmux-ide update [--dry-run]` — act on the update the dock surfaces.
 *
 * The dock's `⬆ v<latest>` chip (see {@link ./update-check.ts}) tells you an
 * update is out; this closes the loop with the ONE command that installs it. The
 * catch is that "the command" depends on how tmux-ide was installed — a cloned
 * dev checkout updates with `git pull`, a global install with its package
 * manager (npm/pnpm/bun) — so the command DETECTS the install method from the
 * running CLI's real path before printing (or, without `--dry-run`, running) it.
 *
 * The detection + rendering are PURE ({@link detectPackageManager},
 * {@link planUpdate}, {@link renderPlan}), so they're unit-tested without a live
 * filesystem; {@link findGitCheckoutRoot} and {@link runUpdate} are the io — the
 * latter is the only place a real global install is ever spawned, and only when
 * `--dry-run` is absent.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getCurrentVersion, getUpdateStatus, isNewer } from "./update-check.ts";

/** The package managers a global install can come from. */
export type PackageManager = "npm" | "pnpm" | "bun";

/** The resolved way to update this install. */
export interface UpdatePlan {
  /** `dev` = a git checkout (`git pull`); otherwise the global package manager. */
  method: "dev" | PackageManager;
  /** The shell command to run, or null for a dev checkout (manual `git pull`). */
  command: string | null;
  /** A short human note on WHY this method was chosen (the detection evidence). */
  reason: string;
}

/** The exact global-install command per package manager. */
export const UPDATE_COMMANDS: Record<PackageManager, string> = {
  npm: "npm install -g tmux-ide@latest",
  pnpm: "pnpm add -g tmux-ide@latest",
  bun: "bun add -g tmux-ide@latest",
};

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/**
 * PURE — infer the package manager from a global CLI path. The global bin lives
 * under a manager-specific directory, so the path is the tell: a `bun`/`.bun`
 * segment → bun, a `pnpm` segment → pnpm, else npm (the default global installer,
 * incl. nvm's `.../node/vX/lib/node_modules/...`). Checked bun→pnpm→npm so the
 * more specific segments win.
 */
export function detectPackageManager(cliPath: string): PackageManager {
  const p = cliPath.toLowerCase();
  if (/(^|\/)\.?bun(\/|$)/.test(p)) return "bun";
  if (p.includes("pnpm")) return "pnpm";
  return "npm";
}

/**
 * PURE — the {@link UpdatePlan} for a CLI at `cliPath`. When `gitRoot` is set (a
 * `.git` was found at/above the CLI — a cloned checkout) the plan is a manual
 * `git pull`; otherwise it's the detected package manager's global-install
 * command.
 */
export function planUpdate(input: { cliPath: string; gitRoot: string | null }): UpdatePlan {
  if (input.gitRoot) {
    return { method: "dev", command: null, reason: `git checkout at ${input.gitRoot}` };
  }
  const pm = detectPackageManager(input.cliPath);
  return {
    method: pm,
    command: UPDATE_COMMANDS[pm],
    reason: `global ${pm} install (${input.cliPath})`,
  };
}

/**
 * PURE — the human-readable block the CLI prints for a plan. Leads with the
 * version delta (or "up to date"/"unknown"), then the command to run — for a dev
 * checkout that's the `git pull` hint, for a global install the exact package-
 * manager line. `dryRun` only changes the framing ("would run" vs "run"); the
 * command shown is identical either way. Ends with the re-adopt note: the running
 * updater keeps the OLD code until `_tmux-ide-chrome` is killed and a session
 * re-adopted, so a fresh dock reflects the new version.
 */
export function renderPlan(
  plan: UpdatePlan,
  { current, latest, dryRun }: { current: string; latest: string | null; dryRun: boolean },
): string {
  const lines: string[] = [];
  // isNewer, not inequality — the registry can lag the checkout (a dev build
  // is AHEAD of the published version), and that must not read as an update.
  if (latest && isNewer(latest, current)) {
    lines.push(`tmux-ide v${current} → v${latest} available`);
  } else if (latest) {
    lines.push(`tmux-ide v${current} is up to date (registry: v${latest})`);
  } else {
    lines.push(`tmux-ide v${current} (latest version unknown — run \`tmux-ide doctor\`)`);
  }
  lines.push("");
  if (plan.method === "dev") {
    lines.push("Detected a cloned checkout — update with git:");
    lines.push("  git pull");
    lines.push(`  (${plan.reason})`);
  } else {
    const verb = dryRun ? "Would run" : "Running";
    lines.push(`Detected a global ${plan.method} install — ${verb}:`);
    lines.push(`  ${plan.command}`);
  }
  lines.push("");
  lines.push("After updating, refresh the dock so it runs the new code:");
  lines.push("  tmux kill-session -t _tmux-ide-chrome   # stop the old updater");
  lines.push("  tmux-ide adopt <session>                # re-adopt to relaunch it");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// io
// ---------------------------------------------------------------------------

/**
 * io — walk up from `startDir` looking for a `.git` entry; return the first
 * directory that has one (a cloned checkout root) or null at the filesystem root.
 * A global install under `node_modules` has no `.git` above it, so this cleanly
 * separates "dev checkout" from "installed package".
 */
export function findGitCheckoutRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * io — run (or, with `dryRun`, just print) the update.
 *
 * `cliDir` is the directory of the running CLI (`bin/`), the anchor for both the
 * git-checkout probe and the package-manager path heuristic. The plan is printed
 * either way; only a non-dry-run global install actually spawns the installer
 * (`execSync`, output inherited). A dev checkout NEVER auto-runs `git pull` — it
 * only prints the hint. Returns the plan so the CLI/tests can assert on it.
 */
export function runUpdate({ cliDir, dryRun }: { cliDir: string; dryRun: boolean }): UpdatePlan {
  const current = getCurrentVersion();
  const { latest } = getUpdateStatus({ currentVersion: current });
  const gitRoot = findGitCheckoutRoot(cliDir);
  const plan = planUpdate({ cliPath: cliDir, gitRoot });
  console.log(renderPlan(plan, { current, latest, dryRun }));
  if (!dryRun && plan.command) {
    console.log("");
    execSync(plan.command, { stdio: "inherit" });
  }
  return plan;
}
