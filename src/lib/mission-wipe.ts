import { join } from "node:path";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import {
  loadGoals,
  deleteGoal,
  loadTasks,
  deleteTask,
  clearMission,
  loadMission,
} from "./task-store.ts";
import { saveValidationState } from "./validation.ts";
import { resetClaims } from "./orchestrator.ts";

const TASKS_DIR = ".tasks";

export interface WipeOptions {
  hard?: boolean;
  includePlans?: boolean;
  dryRun?: boolean;
}

export interface WipeSummary {
  mission: string | null;
  goals: number;
  tasks: number;
  dispatchFiles: number;
  messageFiles: number;
  planFiles: number;
  validationReset: boolean;
  claimsReset: boolean;
  hardLogsTruncated: boolean;
  dryRun: boolean;
}

function countMd(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath).filter((f) => f.endsWith(".md"));
}

function countAll(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath);
}

/**
 * Erase the current mission tracker to a clean slate.
 *
 * Native replacement for wipe-mission.sh's file work: deletes goals (cascading
 * their tasks), any orphan tasks, and the mission; resets the validation
 * contract + state; clears the dispatch queue and the reliable-messaging
 * outbox/receipts/state; and resets the orchestrator's persisted claim lock so
 * task ids are free for reuse. `--hard` also truncates the append-only audit
 * logs; `--include-plans` clears scratch plans/. The one thing left to the
 * caller is bouncing a running daemon so it reloads the cleared claim state.
 */
export function wipeMission(dir: string, opts: WipeOptions = {}): WipeSummary {
  const { hard = false, includePlans = false, dryRun = false } = opts;

  const mission = loadMission(dir);
  const goals = loadGoals(dir);
  const tasks = loadTasks(dir);
  const dispatchDir = join(dir, TASKS_DIR, "dispatch");
  const messagesOutbox = join(dir, TASKS_DIR, "messages", "outbox");
  const messagesReceipts = join(dir, TASKS_DIR, "messages", "receipts");
  const messagesState = join(dir, TASKS_DIR, "messages", "state");
  const plansDir = join(dir, "plans");

  const dispatchFiles = countMd(dispatchDir);
  const messageFiles = [
    ...countAll(messagesOutbox),
    ...countAll(messagesReceipts),
    ...countAll(messagesState),
  ];
  const planFiles = includePlans ? countMd(plansDir) : [];

  const summary: WipeSummary = {
    mission: mission?.title ?? null,
    goals: goals.length,
    tasks: tasks.length,
    dispatchFiles: dispatchFiles.length,
    messageFiles: messageFiles.length,
    planFiles: planFiles.length,
    validationReset: true,
    claimsReset: true,
    hardLogsTruncated: hard,
    dryRun,
  };

  if (dryRun) return summary;

  // Native cascade: goals delete their tasks; then sweep any orphan tasks.
  for (const g of goals) deleteGoal(dir, g.id);
  for (const t of loadTasks(dir)) deleteTask(dir, t.id);
  clearMission(dir);

  // Validation contract + state
  saveValidationState(dir, { assertions: {}, lastVerified: null });
  const contractPath = join(dir, TASKS_DIR, "validation-contract.md");
  writeFileSync(contractPath, "");

  // Dispatch queue + reliable-messaging store. The state/ dir can hold
  // per-recipient `.lock` DIRECTORIES (from withRecipientLock) alongside its
  // JSON — recursive:true so sweeping a held/stale lock doesn't throw EISDIR
  // and abort the wipe half-done.
  for (const f of dispatchFiles) rmSync(join(dispatchDir, f), { force: true });
  for (const [d, files] of [
    [messagesOutbox, countAll(messagesOutbox)],
    [messagesReceipts, countAll(messagesReceipts)],
    [messagesState, countAll(messagesState)],
  ] as const) {
    for (const f of files) rmSync(join(d, f), { recursive: true, force: true });
  }

  if (includePlans) {
    for (const f of planFiles) rmSync(join(plansDir, f), { force: true });
  }

  if (hard) {
    for (const f of ["events.log", "events.log.1", "metrics-history.jsonl"]) {
      rmSync(join(dir, TASKS_DIR, f), { force: true });
    }
    writeFileSync(join(dir, TASKS_DIR, "accounting.json"), "{}");
  }

  // Orchestrator claim lock (persisted); daemon bounce is the caller's step.
  resetClaims(dir);

  return summary;
}
