import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import {
  discoverSessions,
  buildOverviews,
  buildDirectoryDetail,
  buildOrchestratorSnapshot,
  updateTask,
  type SessionOverview,
  type DirectoryDetail,
} from "./discovery.ts";
import {
  listSessionPanes,
  sendCommand,
  sendText,
  getPaneBusyStatus,
  type PaneInfo,
} from "../widgets/lib/pane-comms.ts";
import {
  resolveSendTargets,
  deliverReliably,
  DEFAULT_TIMING,
  WIPE_STANDDOWN_TIMING,
  type ReliableSendTiming,
} from "../send.ts";
import { randomUUID } from "node:crypto";
import { getSessionState, killSession, stopSessionMonitor } from "../lib/tmux.ts";
import { readConfig } from "../lib/yaml-io.ts";
import {
  ensureTasksDir,
  nextTaskId,
  saveTask,
  deleteTask,
  loadMission,
  saveMission,
  loadTasks,
  loadTask,
  type Task,
} from "../lib/task-store.ts";
import { canMarkDone } from "../lib/review-flow.ts";
import { wipeMission } from "../lib/mission-wipe.ts";
import { resetClaims } from "../lib/orchestrator.ts";
import { readEvents, appendEvent } from "../lib/event-log.ts";
import { extractMarks, calculateStats, tagContent } from "../lib/authorship.ts";
import {
  loadValidationState,
  loadValidationContract,
  assertValidationStatus,
  ValidationAssertError,
  checkCoverage,
  parseAssertionIds,
} from "../lib/validation.ts";
import { loadSkills, loadSkill } from "../lib/skill-registry.ts";
import { computeMetrics, loadMissionHistory } from "../lib/metrics.ts";
import { loadPlans, markPlanDone } from "../lib/plan-store.ts";
import { loadTodos, setTodoDone } from "../lib/todo-store.ts";
import {
  loadCheckpoints,
  loadCheckpoint,
  loadCheckpointsForTask,
  saveCheckpoint,
  deleteCheckpoint,
  nextCheckpointId,
  loadReviews,
  loadReview,
  loadReviewsForTask,
  saveReview,
  deleteReview,
  nextReviewId,
  type Checkpoint,
  type ReviewRequest,
  type ReviewComment,
} from "../lib/workflow-store.ts";
import { zValidator } from "@hono/zod-validator";
import {
  updateTaskSchema,
  createTaskSchema,
  savePlanSchema,
  createPlanSchema,
  sendCommandSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  insertMilestoneSchema,
  saveContractSchema,
  missionWipeSchema,
  updateAssertionSchema,
  triggerResearchSchema,
  toggleTodoSchema,
} from "./schemas.ts";
import { AuthService } from "../lib/auth/auth-service.ts";
import { authMiddleware } from "../lib/auth/middleware.ts";
import type { AuthConfig } from "../lib/auth/types.ts";
import { TunnelManager } from "../lib/tunnels/manager.ts";
import { RemoteRegistry } from "../lib/hq/registry.ts";
import { RegistrationPayloadSchema } from "../lib/hq/types.ts";
import { dispatchResearch, loadResearchState } from "../lib/research.ts";
import { serveDashboard } from "./static.ts";

/** Outcome of one reliable delivery, mirroring send.ts DeliveryResult. */
export type ComposerDeliveryStatus = "delivered" | "duplicate" | "superseded" | "failed";

/** Deliver one message to one pane and resolve when its receipt settles. Injectable for tests. */
export type ComposerDeliver = (
  dir: string,
  session: string,
  pane: PaneInfo,
  body: string,
  batchId: string | undefined,
  timing?: ReliableSendTiming,
) => Promise<{ outcome: ComposerDeliveryStatus; attempts: number }>;

export interface CreateAppOptions {
  authService?: AuthService;
  authConfig?: AuthConfig;
  tunnelManager?: TunnelManager;
  remoteRegistry?: RemoteRegistry;
  /** Override the reliable-send delivery (defaults to send.ts deliverReliably). */
  deliver?: ComposerDeliver;
  /** Bounce the daemon after a mission wipe (defaults to a deferred process exit;
   *  the watchdog respawns it, so the console reconnects). Injectable for tests. */
  bounceDaemon?: () => void;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgVersion: string = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
).version;

const ALLOWED_MILESTONE_TRANSITIONS = new Map([
  ["locked", new Set(["active"])],
  ["active", new Set(["validating"])],
  ["validating", new Set(["done", "active"])],
  ["done", new Set<string>()],
]);

function isValidMilestoneTransition(
  from: "locked" | "active" | "done" | "validating",
  to: "locked" | "active" | "done" | "validating",
): boolean {
  if (from === to) return true;
  return ALLOWED_MILESTONE_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const authConfig: AuthConfig = options.authConfig ?? { method: "none", token_expiry: 86400 };
  const authService = options.authService ?? new AuthService();

  // Reliable delivery for the team-input composer — real send by default, injectable for tests.
  const deliver: ComposerDeliver =
    options.deliver ??
    ((dir, session, pane, body, batchId, timing) =>
      deliverReliably(dir, session, pane, body, batchId, timing ?? DEFAULT_TIMING));

  // After a mission wipe, bounce the daemon so it drops its in-memory claim lock;
  // the watchdog respawns it (non-zero exit) and the console reconnects. Deferred
  // so the HTTP response flushes first.
  const bounceDaemon =
    options.bounceDaemon ??
    (() => {
      setTimeout(() => process.exit(1), 300);
    });

  // In-memory per-batch receipt tracker. `/send` seeds a batch and returns its id
  // immediately; the UI polls `/send/batch/:id` for live per-recipient status.
  interface ComposerRecipient {
    paneId: string;
    name: string | null;
    title: string;
    role: string | null;
    status: "retrying" | ComposerDeliveryStatus;
    attempts: number;
  }
  interface ComposerBatch {
    createdAt: number;
    recipients: ComposerRecipient[];
  }
  const sendBatches = new Map<string, ComposerBatch>();
  const BATCH_TTL_MS = 10 * 60 * 1000;
  const pruneBatches = (nowMs: number) => {
    for (const [id, b] of sendBatches) {
      if (nowMs - b.createdAt > BATCH_TTL_MS) sendBatches.delete(id);
    }
  };

  const app = new Hono();

  // Allow cross-origin (Next.js dashboard, Tailscale, etc.)
  app.use("/*", cors());

  // Auth middleware — passes through when method is "none"
  app.use("/*", authMiddleware(authService, authConfig));

  // Global error handler
  app.onError((err, c) => {
    console.error("[command-center]", err.message);
    return c.json({ error: err.message }, 500);
  });

  // --- Auth routes (always available, bypassed by middleware) ---

  app.post("/api/auth/challenge", async (c) => {
    const body = await c.req.json();
    const userId = body.userId ?? authService.getCurrentUser();
    const challenge = authService.createChallenge(userId);
    return c.json(challenge);
  });

  app.post("/api/auth/verify", async (c) => {
    const body = await c.req.json();
    const result = await authService.authenticateWithSSHKey({
      publicKey: body.publicKey,
      signature: body.signature,
      challengeId: body.challengeId,
    });
    if (!result.success) {
      return c.json({ error: result.error }, 401);
    }
    return c.json({ token: result.token, userId: result.userId });
  });

  app.post("/api/auth/token", async (c) => {
    if (authConfig.method !== "none") {
      return c.json({ error: "Direct token generation requires auth method 'none'" }, 403);
    }
    const body = await c.req.json();
    const userId = body.userId ?? authService.getCurrentUser();
    const token = authService.generateToken(userId);
    return c.json({ token, userId });
  });

  // --- API routes ---

  app.get("/api/sessions", (c) => {
    const sessions = discoverSessions();
    const overviews = buildOverviews(sessions);
    return c.json({ sessions: overviews });
  });

  // Owner action items, aggregated across every discovered workspace. Each
  // item carries the directory (session) name so the console can badge it and
  // route its toggle back to the owning store.
  app.get("/api/todos", (c) => {
    const sessions = discoverSessions();
    const todos = sessions.flatMap((s) =>
      loadTodos(s.dir).map((t) => ({ ...t, directory: s.name })),
    );
    return c.json({ todos });
  });

  app.post("/api/directory/:name/todo/:id", zValidator("json", toggleTodoSchema), async (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    const { done } = c.req.valid("json");
    const item = setTodoDone(session.dir, id, done);
    if (!item) {
      return c.json({ error: "Todo not found" }, 404);
    }
    return c.json({ ok: true, todo: item });
  });

  app.get("/api/directory/:name", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    const detail = buildDirectoryDetail(session);
    const orchestratorSnapshot = buildOrchestratorSnapshot(session);
    let orchestratorConfig: { enabled: boolean; dispatchMode: string } | null = null;
    try {
      const { config } = readConfig(session.dir);
      const orch = config.orchestrator;
      if (orch) {
        orchestratorConfig = {
          enabled: orch.enabled ?? false,
          dispatchMode: orch.dispatch_mode ?? "tasks",
        };
      }
    } catch {
      // unreadable ide.yml
    }
    return c.json({ ...detail, orchestratorSnapshot, orchestratorConfig });
  });

  app.get("/api/directory/:name/panes", (c) => {
    const name = c.req.param("name");
    let panes: ReturnType<typeof listSessionPanes>;
    try {
      panes = listSessionPanes(name);
    } catch {
      return c.json({ error: "Session not found" }, 404);
    }
    if (panes.length === 0) {
      // Verify the session actually exists before returning empty
      const sessions = discoverSessions();
      if (!sessions.find((s) => s.name === name)) {
        return c.json({ error: "Session not found" }, 404);
      }
    }
    return c.json({
      panes: panes.map((p) => ({
        id: p.id,
        index: p.index,
        title: p.title,
        currentCommand: p.currentCommand,
        width: p.width,
        height: p.height,
        active: p.active,
        role: p.role,
        name: p.name,
        type: p.type,
      })),
    });
  });

  app.post("/api/directory/:name/task/:id", zValidator("json", updateTaskSchema), async (c) => {
    const name = c.req.param("name");
    const taskId = c.req.param("id");

    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const { override, ...fields } = c.req.valid("json");

    // Review-flow gate (VAL-017): done is reachable only from review by a
    // reviewer, OR via an explicit human-operator override. The console has no
    // reviewer @ide_role, so a done transition here needs override=true; a
    // refusal returns its reason (the UI renders it — no silent dead button).
    if (fields.status === "done") {
      const task = loadTask(session.dir, taskId);
      if (!task) return c.json({ error: "Task not found" }, 404);
      const guard = canMarkDone(task, { name: "operator", role: null }, override ?? false);
      if (!guard.ok) {
        return c.json({ error: guard.error }, 409);
      }
      if (override) {
        appendEvent(session.dir, {
          timestamp: new Date().toISOString(),
          type: "override",
          taskId,
          agent: "operator",
          message: `operator override: marked ${taskId} done, bypassing the reviewer gate (was '${task.status}')`,
        });
      }
    }

    const updated = updateTask(session.dir, taskId, fields);
    if (!updated) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json({ ok: true, task: updated });
  });

  // Create task
  app.post("/api/directory/:name/task", zValidator("json", createTaskSchema), async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = c.req.valid("json");

    ensureTasksDir(session.dir);

    // Invariant guards (VAL-016): create-only fields must reference real entities,
    // else the task can never dispatch or its coverage never resolves.
    const mission = loadMission(session.dir);
    const contract = loadValidationContract(session.dir);
    const assertionIds = contract ? parseAssertionIds(contract) : [];
    const existingTaskIds = new Set(loadTasks(session.dir).map((t) => t.id));

    if (body.fulfills?.length) {
      const unknownAssertions = body.fulfills.filter((a) => !assertionIds.includes(a));
      if (unknownAssertions.length > 0) {
        return c.json({ error: "Unknown assertion(s) in fulfills", unknownAssertions }, 409);
      }
    }
    if (body.depends?.length) {
      const unknownTasks = body.depends.filter((d) => !existingTaskIds.has(d));
      if (unknownTasks.length > 0) {
        return c.json({ error: "Unknown task(s) in depends", unknownTasks }, 409);
      }
    }
    if (body.milestone && !mission?.milestones.some((m) => m.id === body.milestone)) {
      return c.json({ error: `Unknown milestone: ${body.milestone}` }, 409);
    }

    const id = nextTaskId(session.dir);
    const now = new Date().toISOString();
    const task: Task = {
      id,
      title: body.title.trim(),
      description: body.description ?? "",
      goal: body.goal ?? null,
      status: "todo",
      assignee: body.assignee ?? null,
      priority: body.priority ?? 2,
      created: now,
      updated: now,
      tags: body.tags ?? [],
      proof: null,
      depends_on: body.depends ?? [],
      retryCount: 0,
      maxRetries: 5,
      lastError: null,
      nextRetryAt: null,
      milestone: body.milestone ?? null,
      specialty: body.specialty ?? null,
      fulfills: body.fulfills ?? [],
      discoveredIssues: [],
      salientSummary: null,
    };
    saveTask(session.dir, task);
    return c.json({ ok: true, task }, 201);
  });

  // Delete task
  app.delete("/api/directory/:name/task/:id", (c) => {
    const name = c.req.param("name");
    const taskId = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!deleteTask(session.dir, taskId)) {
      return c.json({ error: "Task not found" }, 404);
    }
    return c.json({ ok: true, deleted: taskId });
  });

  // List plan files with status metadata
  app.get("/api/directory/:name/plans", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const plans = loadPlans(session.dir).map((p) => ({
      name: p.name,
      path: `${p.name}.md`,
      title: p.title,
      status: p.status,
      effort: p.effort ?? null,
      completed: p.completed ?? null,
    }));

    return c.json({ plans });
  });

  // Create a new (stub) plan file. Collection POST = create; distinct from the
  // by-filename save route, which overwrites. Kebab-case only (zod → 400),
  // collision → 409. The editor opens on it and saves via the by-filename route.
  app.post("/api/directory/:name/plans", zValidator("json", createPlanSchema), (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const { name: planName } = c.req.valid("json");
    const plansDir = join(session.dir, "plans");
    if (!existsSync(plansDir)) mkdirSync(plansDir, { recursive: true });
    const filePath = join(plansDir, `${planName}.md`);
    if (existsSync(filePath)) {
      return c.json({ error: "A plan with that name already exists", name: planName }, 409);
    }

    writeFileSync(filePath, `# ${planName}\n`);
    return c.json({ ok: true, name: planName, path: `${planName}.md` }, 201);
  });

  // Read a single plan file
  app.get("/api/directory/:name/plans/:filename", (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Sanitize filename — no path traversal
    const safeName = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "");
    const filePath = join(
      session.dir,
      "plans",
      safeName.endsWith(".md") ? safeName : `${safeName}.md`,
    );

    if (!existsSync(filePath)) {
      return c.json({ error: "Plan not found" }, 404);
    }

    const raw = readFileSync(filePath, "utf-8");
    const { content, marks } = extractMarks(raw);
    const stats = marks ? calculateStats(marks.marks) : null;
    return c.json({
      name: safeName.replace(/\.md$/, ""),
      content,
      marks: marks?.marks ?? null,
      stats,
    });
  });

  // Save a plan file (with authorship tagging)
  app.post("/api/directory/:name/plans/:filename", zValidator("json", savePlanSchema), async (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = c.req.valid("json");

    const safeName = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "");
    const filePath = join(
      session.dir,
      "plans",
      safeName.endsWith(".md") ? safeName : `${safeName}.md`,
    );
    const plansDir = join(session.dir, "plans");
    if (!existsSync(plansDir)) mkdirSync(plansDir, { recursive: true });

    // Auto-tag uncovered character ranges as human-authored
    const tagged = tagContent(body.content, "human");
    writeFileSync(filePath, tagged);

    return c.json({ ok: true });
  });

  // Delete a plan file
  app.delete("/api/directory/:name/plans/:filename", (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const safeName = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "");
    const filePath = join(
      session.dir,
      "plans",
      safeName.endsWith(".md") ? safeName : `${safeName}.md`,
    );

    if (!existsSync(filePath)) {
      return c.json({ error: "Plan not found" }, 404);
    }

    unlinkSync(filePath);
    return c.json({ ok: true, deleted: safeName });
  });

  // Mark a plan as done
  app.post("/api/directory/:name/plans/:filename/done", (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const safeName = filename.replace(/[^a-zA-Z0-9_\-. ]/g, "").replace(/\.md$/, "");
    const result = markPlanDone(session.dir, safeName);
    if (!result) {
      return c.json({ error: "Plan not found" }, 404);
    }

    return c.json({ ok: true, plan: result });
  });

  // --- Checkpoints ---

  app.get("/api/directory/:name/checkpoints", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const taskId = c.req.query("task");
    const list = taskId
      ? loadCheckpointsForTask(session.dir, taskId)
      : loadCheckpoints(session.dir);
    return c.json({ checkpoints: list });
  });

  app.get("/api/directory/:name/checkpoints/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const cp = loadCheckpoint(session.dir, id);
    if (!cp) return c.json({ error: "Checkpoint not found" }, 404);
    return c.json({ checkpoint: cp });
  });

  app.post("/api/directory/:name/checkpoints", async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const body = await c.req.json();
    const now = new Date().toISOString();
    const id = nextCheckpointId(session.dir);
    const checkpoint: Checkpoint = {
      id,
      taskId: body.taskId ?? "",
      title: body.title ?? `Checkpoint ${id}`,
      description: body.description ?? "",
      status: "pending",
      createdBy: body.createdBy ?? "",
      reviewedBy: null,
      created: now,
      updated: now,
      diff: body.diff ?? null,
      files: body.files ?? [],
      comments: [],
    };
    saveCheckpoint(session.dir, checkpoint);
    return c.json({ ok: true, checkpoint }, 201);
  });

  app.post("/api/directory/:name/checkpoints/:id", async (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const existing = loadCheckpoint(session.dir, id);
    if (!existing) return c.json({ error: "Checkpoint not found" }, 404);
    const body = await c.req.json();
    const updated: Checkpoint = {
      ...existing,
      ...body,
      id: existing.id,
      created: existing.created,
      updated: new Date().toISOString(),
    };
    saveCheckpoint(session.dir, updated);
    return c.json({ ok: true, checkpoint: updated });
  });

  app.delete("/api/directory/:name/checkpoints/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (!deleteCheckpoint(session.dir, id)) return c.json({ error: "Checkpoint not found" }, 404);
    return c.json({ ok: true, deleted: id });
  });

  // --- Reviews ---

  app.get("/api/directory/:name/reviews", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const taskId = c.req.query("task");
    const list = taskId ? loadReviewsForTask(session.dir, taskId) : loadReviews(session.dir);
    return c.json({ reviews: list });
  });

  app.get("/api/directory/:name/reviews/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const review = loadReview(session.dir, id);
    if (!review) return c.json({ error: "Review not found" }, 404);
    return c.json({ review });
  });

  app.post("/api/directory/:name/reviews", async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const body = await c.req.json();
    const now = new Date().toISOString();
    const id = nextReviewId(session.dir);
    const review: ReviewRequest = {
      id,
      taskId: body.taskId ?? "",
      checkpointId: body.checkpointId ?? null,
      title: body.title ?? `Review ${id}`,
      description: body.description ?? "",
      status: "open",
      requestedBy: body.requestedBy ?? "",
      reviewer: body.reviewer ?? null,
      created: now,
      updated: now,
      comments: [],
    };
    saveReview(session.dir, review);
    return c.json({ ok: true, review }, 201);
  });

  app.post("/api/directory/:name/reviews/:id", async (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const existing = loadReview(session.dir, id);
    if (!existing) return c.json({ error: "Review not found" }, 404);
    const body = await c.req.json();
    const updated: ReviewRequest = {
      ...existing,
      ...body,
      id: existing.id,
      created: existing.created,
      updated: new Date().toISOString(),
    };
    saveReview(session.dir, updated);
    return c.json({ ok: true, review: updated });
  });

  app.post("/api/directory/:name/reviews/:id/comment", async (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const existing = loadReview(session.dir, id);
    if (!existing) return c.json({ error: "Review not found" }, 404);
    const body = await c.req.json();
    const comment: ReviewComment = {
      author: body.author ?? "",
      body: body.body ?? "",
      created: new Date().toISOString(),
    };
    existing.comments.push(comment);
    existing.updated = comment.created;
    saveReview(session.dir, existing);
    return c.json({ ok: true, review: existing });
  });

  app.delete("/api/directory/:name/reviews/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (!deleteReview(session.dir, id)) return c.json({ error: "Review not found" }, 404);
    return c.json({ ok: true, deleted: id });
  });

  app.get("/api/directory/:name/diff", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Get git diff (staged + unstaged vs HEAD)
    let diff = "";
    try {
      diff = execFileSync("git", ["diff", "HEAD"], {
        cwd: session.dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // No HEAD yet or not a git repo — try unstaged only
    }
    if (!diff) {
      try {
        diff = execFileSync("git", ["diff"], {
          cwd: session.dir,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        // Not a git repo
      }
    }

    // Get list of changed files with stats
    interface DiffFile {
      file: string;
      additions: number;
      deletions: number;
    }
    let files: DiffFile[] = [];
    try {
      const numstat = execFileSync("git", ["diff", "--numstat", "HEAD"], {
        cwd: session.dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      files = numstat
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [added, removed, file] = line.split("\t");
          return {
            file: file!,
            additions: parseInt(added!, 10) || 0,
            deletions: parseInt(removed!, 10) || 0,
          };
        });
    } catch {
      // Fall back to unstaged
      try {
        const numstat = execFileSync("git", ["diff", "--numstat"], {
          cwd: session.dir,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        files = numstat
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [added, removed, file] = line.split("\t");
            return {
              file: file!,
              additions: parseInt(added!, 10) || 0,
              deletions: parseInt(removed!, 10) || 0,
            };
          });
      } catch {
        // Not a git repo
      }
    }

    return c.json({ diff, files });
  });

  // Per-file diff endpoint
  app.get("/api/directory/:name/diff/:file{.+}", (c) => {
    const name = c.req.param("name");
    const file = c.req.param("file");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);

    let diff = "";
    try {
      diff = execFileSync("git", ["diff", "HEAD", "--", file], {
        cwd: session.dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // no committed diff
    }
    if (!diff) {
      try {
        diff = execFileSync("git", ["diff", "--", file], {
          cwd: session.dir,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        // no working-tree diff
      }
    }

    return c.json({ file, diff });
  });

  // --- Milestone endpoints ---

  app.get("/api/directory/:name/milestones", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const mission = loadMission(session.dir);
    if (!mission) return c.json({ milestones: [] });
    const tasks = loadTasks(session.dir);
    const milestones = [...mission.milestones]
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const mTasks = tasks.filter((t) => t.milestone === m.id);
        return {
          ...m,
          taskCount: mTasks.length,
          tasksDone: mTasks.filter((t) => t.status === "done").length,
        };
      });
    return c.json({ milestones });
  });

  app.get("/api/directory/:name/milestones/:id", (c) => {
    const name = c.req.param("name");
    const milestoneId = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const mission = loadMission(session.dir);
    if (!mission) return c.json({ error: "No mission" }, 404);
    const milestone = mission.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return c.json({ error: "Milestone not found" }, 404);
    const tasks = loadTasks(session.dir).filter((t) => t.milestone === milestoneId);
    return c.json({ milestone, tasks });
  });

  app.post(
    "/api/directory/:name/milestones",
    zValidator("json", createMilestoneSchema),
    async (c) => {
      const name = c.req.param("name");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);
      const mission = loadMission(session.dir);
      if (!mission) return c.json({ error: "No mission" }, 404);
      const body = c.req.valid("json");
      const id = `M${body.sequence}`;
      if (mission.milestones.find((m) => m.id === id)) {
        return c.json({ error: `Milestone ${id} already exists` }, 409);
      }
      const now = new Date().toISOString();
      const hasActive = mission.milestones.some(
        (m) => m.status === "active" || m.status === "done",
      );
      const milestone = {
        id,
        title: body.title,
        description: body.description ?? "",
        status: (hasActive ? "locked" : "active") as "locked" | "active",
        order: body.sequence,
        created: now,
        updated: now,
      };
      mission.milestones.push(milestone);
      mission.milestones.sort((a, b) => a.order - b.order);
      mission.updated = now;
      saveMission(session.dir, mission);
      return c.json({ ok: true, milestone }, 201);
    },
  );

  // Registered before the `/milestones/:id` param route so the static "insert"
  // segment isn't captured as an :id.
  app.post(
    "/api/directory/:name/milestones/insert",
    zValidator("json", insertMilestoneSchema),
    (c) => {
      const name = c.req.param("name");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);
      const mission = loadMission(session.dir);
      if (!mission) return c.json({ error: "No mission" }, 404);
      const body = c.req.valid("json");

      const ordered = [...mission.milestones].sort((a, b) => a.order - b.order);
      const pos = Math.min(Math.max(body.position, 1), ordered.length + 1);
      const now = new Date().toISOString();
      const inserted = {
        id: "",
        title: body.title,
        description: body.description ?? "",
        status: "locked" as const,
        order: 0,
        created: now,
        updated: now,
      };
      ordered.splice(pos - 1, 0, inserted);

      // Reassign contiguous ids/orders; record old→new id remap for the task cascade.
      const remap = new Map<string, string>();
      ordered.forEach((m, i) => {
        const newId = `M${i + 1}`;
        if (m !== inserted && m.id !== newId) remap.set(m.id, newId);
        m.id = newId;
        m.order = i + 1;
        if (m !== inserted) m.updated = now;
      });

      mission.milestones = ordered;
      mission.updated = now;
      saveMission(session.dir, mission);

      if (remap.size > 0) {
        for (const task of loadTasks(session.dir)) {
          if (task.milestone && remap.has(task.milestone)) {
            task.milestone = remap.get(task.milestone)!;
            saveTask(session.dir, task);
          }
        }
      }

      return c.json(
        { ok: true, inserted, milestones: ordered, remapped: Object.fromEntries(remap) },
        201,
      );
    },
  );

  app.post(
    "/api/directory/:name/milestones/:id",
    zValidator("json", updateMilestoneSchema),
    async (c) => {
      const name = c.req.param("name");
      const milestoneId = c.req.param("id");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);
      const mission = loadMission(session.dir);
      if (!mission) return c.json({ error: "No mission" }, 404);
      const milestone = mission.milestones.find((m) => m.id === milestoneId);
      if (!milestone) return c.json({ error: "Milestone not found" }, 404);
      const body = c.req.valid("json");
      if (body.status && !isValidMilestoneTransition(milestone.status, body.status)) {
        return c.json(
          {
            error: `Invalid milestone status transition: ${milestone.status} -> ${body.status}`,
          },
          409,
        );
      }
      if (body.status) milestone.status = body.status;
      if (body.title) milestone.title = body.title;
      if (body.description !== undefined) milestone.description = body.description;
      milestone.updated = new Date().toISOString();
      mission.updated = milestone.updated;
      saveMission(session.dir, mission);
      return c.json({ ok: true, milestone });
    },
  );

  // --- Validation endpoints ---

  app.get("/api/directory/:name/validation", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const state = loadValidationState(session.dir);
    const contract = loadValidationContract(session.dir);
    return c.json({ contract: contract ?? null, state: state ?? null });
  });

  app.get("/api/directory/:name/validation/coverage", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(checkCoverage(session.dir));
  });

  // Canonical assertion-ID list parsed from the contract — the create-task modal's
  // `fulfills` options come from here so the UI never re-implements the parser.
  app.get("/api/directory/:name/validation/assertions", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const contract = loadValidationContract(session.dir);
    return c.json({ assertions: contract ? parseAssertionIds(contract) : [] });
  });

  // Raw contract markdown for the editor (mirrors the plans-editor read path).
  app.get("/api/directory/:name/validation/contract", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ content: loadValidationContract(session.dir) ?? "" });
  });

  // Save the contract text. Guard I5: the new content may add/rename/reorder
  // assertions, but must not DROP one a task's `fulfills` still claims — that would
  // orphan the claim and break the coverage gate.
  app.post(
    "/api/directory/:name/validation/contract",
    zValidator("json", saveContractSchema),
    (c) => {
      const name = c.req.param("name");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);
      const { content } = c.req.valid("json");

      const newIds = new Set(parseAssertionIds(content));
      // Scope the claimed-check to the current mission generation: assertion ids
      // (VAL-001, …) are reused across missions, so retained prior-generation
      // tasks still carrying a `fulfills` for an id absent from the new contract
      // would reject every save — even pure additions. Tasks created after the
      // mission started belong to this generation (same approach as
      // checkMilestoneCompletion). Without a mission there is no generation
      // boundary, so fall back to checking all tasks.
      const mission = loadMission(session.dir);
      const stillClaimed: Record<string, string[]> = {};
      for (const task of loadTasks(session.dir)) {
        if (mission && task.created < mission.created) continue;
        for (const assertId of task.fulfills ?? []) {
          if (!newIds.has(assertId)) {
            (stillClaimed[assertId] ??= []).push(task.id);
          }
        }
      }
      if (Object.keys(stillClaimed).length > 0) {
        return c.json(
          { error: "Cannot drop assertion(s) still claimed by a task's fulfills", stillClaimed },
          409,
        );
      }

      ensureTasksDir(session.dir);
      // Same path convention as loadValidationContract (.tasks/validation-contract.md).
      writeFileSync(join(session.dir, ".tasks", "validation-contract.md"), content);
      return c.json({ ok: true, assertions: [...newIds] });
    },
  );

  // Set an assertion's status from the console validation tab. Delegates to the
  // shared assertValidationStatus write path so the UI, the CLI, and the
  // orchestrator's remediation flow stay in lockstep (evidence-required on
  // passing/failing is enforced there and surfaces as a 400).
  app.post(
    "/api/directory/:name/validation/assert/:assertId",
    zValidator("json", updateAssertionSchema),
    (c) => {
      const name = c.req.param("name");
      const assertId = c.req.param("assertId");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);
      const body = c.req.valid("json");
      try {
        const entry = assertValidationStatus(session.dir, assertId, {
          status: body.status,
          evidence: body.evidence,
          verifiedBy: body.verifiedBy,
        });
        return c.json({ ok: true, assertionId: assertId, ...entry });
      } catch (err) {
        if (err instanceof ValidationAssertError) {
          return c.json({ error: err.message }, 400);
        }
        throw err;
      }
    },
  );

  app.get("/api/directory/:name/research", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);

    const state = loadResearchState(session.dir);
    const tasks = loadTasks(session.dir);
    const activeTask =
      state.activeResearchTaskId != null
        ? (tasks.find((task) => task.id === state.activeResearchTaskId) ?? null)
        : null;
    const findings = tasks
      .filter((task) => task.tags.includes("research") && task.status === "done")
      .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
      .slice(0, 10);

    return c.json({ state, activeTask, findings });
  });

  app.post(
    "/api/directory/:name/research/trigger",
    zValidator("json", triggerResearchSchema),
    async (c) => {
      const name = c.req.param("name");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);

      const body = c.req.valid("json");
      const tasks = loadTasks(session.dir);
      const researchState = loadResearchState(session.dir);

      let maxConcurrentAgents = 10;
      let masterPane: string | null = null;
      let researchEnabled = true;
      try {
        const { config } = readConfig(session.dir);
        maxConcurrentAgents = config.orchestrator?.max_concurrent_agents ?? 10;
        masterPane = config.orchestrator?.master_pane ?? null;
        researchEnabled = config.orchestrator?.research?.enabled ?? true;
      } catch {
        // ide.yml unreadable — use defaults
      }

      const task = dispatchResearch(
        {
          session: name,
          dir: session.dir,
          masterPane,
          maxConcurrentAgents,
          research: { enabled: researchEnabled },
        },
        {
          lastActivity: new Map(),
          previousTasks: new Map(),
          claimedTasks: new Set(),
          taskClaimTimes: new Map(),
        },
        researchState,
        tasks,
        listSessionPanes(name),
        {
          type: body.type,
          reason: `Manual research trigger: ${body.type}`,
        },
      );

      if (!task) {
        return c.json({ error: `Unable to dispatch research trigger "${body.type}"` }, 409);
      }

      return c.json({ ok: true, task }, 201);
    },
  );

  // --- Skill endpoints ---

  app.get("/api/directory/:name/skills", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const skills = loadSkills(session.dir);
    return c.json({ skills });
  });

  app.get("/api/directory/:name/skills/:skillName", (c) => {
    const name = c.req.param("name");
    const skillName = c.req.param("skillName");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const skill = loadSkill(session.dir, skillName);
    if (!skill) return c.json({ error: "Skill not found" }, 404);
    return c.json({ skill });
  });

  // --- Mission endpoints ---

  app.get("/api/directory/:name/mission", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const mission = loadMission(session.dir);
    if (!mission) return c.json({ error: "No mission" }, 404);
    const valState = loadValidationState(session.dir);
    const assertions = valState ? Object.values(valState.assertions) : [];
    const validationSummary = {
      total: assertions.length,
      passing: assertions.filter((a) => a.status === "passing").length,
      failing: assertions.filter((a) => a.status === "failing").length,
      pending: assertions.filter((a) => a.status === "pending").length,
      blocked: assertions.filter((a) => a.status === "blocked").length,
    };
    return c.json({ mission, validationSummary });
  });

  app.post("/api/directory/:name/mission/plan-complete", async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const mission = loadMission(session.dir);
    if (!mission) return c.json({ error: "No mission" }, 404);
    if (mission.status !== "planning") {
      return c.json({ error: `Mission is "${mission.status}", expected "planning"` }, 409);
    }
    mission.status = "active";
    const sorted = [...mission.milestones].sort((a, b) => a.order - b.order);
    const first = sorted.find((m) => m.status === "locked");
    if (first) {
      first.status = "active";
      first.updated = new Date().toISOString();
    }
    mission.updated = new Date().toISOString();
    saveMission(session.dir, mission);
    return c.json({ ok: true, mission });
  });

  // Mission kill-switch: stand the team down, then wipe the tracker to a clean
  // slate and bounce the daemon. `confirm` must equal the mission title.
  app.post("/api/directory/:name/mission/wipe", zValidator("json", missionWipeSchema), async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const mission = loadMission(session.dir);
    if (!mission) return c.json({ error: "No mission" }, 404);

    const { confirm } = c.req.valid("json");
    if (confirm !== mission.title) {
      // Type-the-name gate: a mismatch is a no-op (nothing wiped, no bounce).
      return c.json({ error: "Confirmation does not match the mission title", wiped: false }, 409);
    }

    // 1. Stand-down broadcast to every agent pane via the reliable-send '*' path,
    //    before the wipe clears the messaging store. Best-effort + bounded: the
    //    per-pane budget uses WIPE_STANDDOWN_TIMING (~1.5s) rather than the
    //    composer's 45s default, since deliveries fan out concurrently and this
    //    await is the user-visible confirm→response latency. The deliver-before-
    //    wipe ordering is preserved — the wipe below still runs only after this
    //    broadcast settles.
    const panes = listSessionPanes(name);
    const targets = resolveSendTargets(panes, "*").filter(
      (p) => getPaneBusyStatus(name, p.id) === "agent",
    );
    const standDown = `STAND DOWN — the operator wiped mission "${mission.title}". Stop all in-flight work; the tracker (tasks/milestones/validation) is cleared and the daemon is bouncing.`;
    const batchId = randomUUID().slice(0, 8);
    await Promise.all(
      targets.map((pane) =>
        deliver(session.dir, name, pane, standDown, batchId, WIPE_STANDDOWN_TIMING).catch(
          () => undefined,
        ),
      ),
    );

    // 2. Operator-attributed audit entry (like the done override).
    appendEvent(session.dir, {
      timestamp: new Date().toISOString(),
      type: "override",
      agent: "operator",
      message: `operator kill-switch: stood down ${targets.length} agent pane(s) and wiped mission "${mission.title}" (tasks/milestones/validation/claim-lock reset)`,
    });

    // 3. Native wipe (same code path as `tmux-ide mission wipe`, incl. claim-lock
    //    reset), then bounce the daemon so it reloads the cleared state.
    const summary = wipeMission(session.dir);
    resetClaims(session.dir);
    bounceDaemon();

    return c.json({ ok: true, wiped: true, summary });
  });

  // --- Metrics endpoints ---

  app.get("/api/directory/:name/metrics", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(computeMetrics(session.dir));
  });

  app.get("/api/directory/:name/metrics/agents", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ agents: computeMetrics(session.dir).agents });
  });

  app.get("/api/directory/:name/metrics/timeline", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ timeline: computeMetrics(session.dir).timeline });
  });

  app.get("/api/directory/:name/metrics/history", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ history: loadMissionHistory(session.dir) });
  });

  // Events endpoint — returns recent orchestrator events
  app.get("/api/directory/:name/events", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const allEvents = readEvents(session.dir);
    // Return last 50 events, newest first
    const recent = allEvents.slice(-50).reverse();

    // Add relative timestamps
    const now = Date.now();
    const withRelative = recent.map((e) => {
      const ms = now - new Date(e.timestamp).getTime();
      let relative: string;
      if (ms < 60000) relative = `${Math.floor(ms / 1000)}s ago`;
      else if (ms < 3600000) relative = `${Math.floor(ms / 60000)}m ago`;
      else if (ms < 86400000) relative = `${Math.floor(ms / 3600000)}h ago`;
      else relative = `${Math.floor(ms / 86400000)}d ago`;
      return { ...e, relative };
    });

    return c.json({ events: withRelative });
  });

  // --- Remote command execution endpoints ---

  // Preview which panes a send target (including globs like "cw*"/"*") resolves
  // to, before sending. Reuses resolveSendTargets so the preview and the actual
  // send can never disagree.
  app.get("/api/directory/:name/send/preview", (c) => {
    const name = c.req.param("name");
    const target = c.req.query("target") ?? "";
    let panes: ReturnType<typeof listSessionPanes>;
    try {
      panes = listSessionPanes(name);
    } catch {
      return c.json({ error: "Session not found" }, 404);
    }
    if (panes.length === 0) {
      const sessions = discoverSessions();
      if (!sessions.find((s) => s.name === name)) {
        return c.json({ error: "Session not found" }, 404);
      }
    }
    const matches = target.trim()
      ? resolveSendTargets(panes, target.trim()).map((p) => ({
          id: p.id,
          name: p.name,
          title: p.title,
          role: p.role ?? null,
        }))
      : [];
    return c.json({ target, matches });
  });

  // Send message to a pane by name/title/role/ID
  app.post("/api/directory/:name/send", zValidator("json", sendCommandSchema), async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const { target, message, noEnter, fireAndForget } = c.req.valid("json");

    const panes = listSessionPanes(name);
    const targets = resolveSendTargets(panes, target);
    if (targets.length === 0) {
      const available = panes.map((p) => ({
        id: p.id,
        title: p.title,
        name: p.name,
        role: p.role,
      }));
      return c.json({ error: "Pane not found", target, available }, 404);
    }

    pruneBatches(Date.now());
    const batchId = randomUUID().slice(0, 8);
    // Only agent panes can run `recv`; non-agent panes and --fire-and-forget fall
    // back to a direct paste (delivered immediately, no receipt to await).
    const useReliable = !noEnter && !fireAndForget;

    const recipients: ComposerRecipient[] = targets.map((pane) => ({
      paneId: pane.id,
      name: pane.name ?? null,
      title: pane.title,
      role: pane.role ?? null,
      status: "retrying",
      attempts: 0,
    }));
    sendBatches.set(batchId, { createdAt: Date.now(), recipients });

    for (const pane of targets) {
      const rec = recipients.find((r) => r.paneId === pane.id)!;
      const isAgent = getPaneBusyStatus(name, pane.id) === "agent";

      if (useReliable && isAgent) {
        // Reliable path: recv reads the full body from the outbox, so no multiline
        // collapse. Fire in the background; update the tracker when the receipt settles.
        void deliver(session.dir, name, pane, message, batchId)
          .then((result) => {
            rec.status = result.outcome;
            rec.attempts = result.attempts;
          })
          .catch(() => {
            rec.status = "failed";
          });
        appendEvent(session.dir, {
          timestamp: new Date().toISOString(),
          type: "send",
          target: pane.name ?? pane.title,
          paneId: pane.id,
          message: `[reliable] ${message.slice(0, 90)}`,
        });
      } else {
        const prepared = isAgent ? message.replace(/\n+/g, " ").trim() : message;
        if (noEnter) sendText(name, pane.id, prepared);
        else sendCommand(name, pane.id, prepared);
        rec.status = "delivered";
        rec.attempts = 1;
        appendEvent(session.dir, {
          timestamp: new Date().toISOString(),
          type: "send",
          target: pane.name ?? pane.title,
          paneId: pane.id,
          message: prepared.length > 100 ? prepared.slice(0, 100) + "..." : prepared,
        });
      }
    }

    return c.json(
      { ok: true, session: name, batchId, fanOut: targets.length > 1, recipients },
      202,
    );
  });

  // Poll per-recipient receipt status for a send batch (composer live indicators).
  app.get("/api/directory/:name/send/batch/:batchId", (c) => {
    const batch = sendBatches.get(c.req.param("batchId"));
    if (!batch) return c.json({ error: "Batch not found" }, 404);
    const done = batch.recipients.every((r) => r.status !== "retrying");
    const ok = batch.recipients.every((r) => r.status !== "failed");
    return c.json({ batchId: c.req.param("batchId"), done, ok, recipients: batch.recipients });
  });

  // Launch a tmux-ide session (shells out to CLI since launch has complex side effects)
  const execFileAsync = promisify(execFile);

  app.post("/api/directory/:name/launch", async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Check if already running
    const state = getSessionState(name);
    if (state.running) {
      return c.json({ ok: true, session: name, status: "already_running" });
    }

    try {
      await execFileAsync("tmux-ide", ["--json"], {
        cwd: session.dir,
        timeout: 30000,
        env: { ...process.env, TMUX: "" }, // Clear TMUX to avoid nesting
      });
      return c.json({ ok: true, session: name, status: "launched" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Launch failed", detail: message }, 500);
    }
  });

  // Stop a tmux-ide session
  app.post("/api/directory/:name/stop", async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const state = getSessionState(name);
    if (!state.running) {
      return c.json({ ok: true, session: name, status: "not_running" });
    }

    stopSessionMonitor(name);
    const result = killSession(name);
    if (result.stopped) {
      return c.json({ ok: true, session: name, status: "stopped" });
    }
    return c.json({ error: "Stop failed", reason: result.reason }, 500);
  });

  // SSE endpoint — cursor-based event streaming with orchestrator state
  app.get("/api/events", (c) => {
    return streamSSE(c, async (stream) => {
      let prevOverviews: SessionOverview[] = [];
      let prevDetails = new Map<string, DirectoryDetail>();
      const eventCursors = new Map<string, number>(); // session → last-seen event count
      let prevOrchHashes = new Map<string, string>(); // session → orchestrator snapshot hash

      const poll = () => {
        const sessions = discoverSessions();
        const overviews = buildOverviews(sessions);

        // Detect session-level changes
        const prevNames = new Set(prevOverviews.map((s) => s.name));
        const currNames = new Set(overviews.map((s) => s.name));

        for (const overview of overviews) {
          if (!prevNames.has(overview.name)) {
            stream.writeSSE({
              event: "session_added",
              data: JSON.stringify(overview),
            });
            continue;
          }

          const prev = prevOverviews.find((s) => s.name === overview.name);
          if (
            prev &&
            (prev.stats.doneTasks !== overview.stats.doneTasks ||
              prev.stats.totalTasks !== overview.stats.totalTasks ||
              prev.stats.activeAgents !== overview.stats.activeAgents)
          ) {
            stream.writeSSE({
              event: "session_update",
              data: JSON.stringify(overview),
            });
          }
        }

        for (const prev of prevOverviews) {
          if (!currNames.has(prev.name)) {
            stream.writeSSE({
              event: "session_removed",
              data: JSON.stringify({ name: prev.name }),
            });
          }
        }

        // Per-session: event log cursor + orchestrator state + task/agent diffs
        for (const session of sessions) {
          // Cursor-based event streaming from event log
          const events = readEvents(session.dir);
          const cursor = eventCursors.get(session.name) ?? 0;

          // Handle log rotation: if events.length < cursor, log was rotated
          const effectiveCursor = events.length < cursor ? 0 : cursor;
          const newEvents = events.slice(effectiveCursor);

          for (const evt of newEvents) {
            const eventId = `${evt.timestamp}:${evt.type}:${evt.taskId ?? ""}`;
            stream.writeSSE({
              id: eventId,
              event: "orchestrator_event",
              data: JSON.stringify({ session: session.name, ...evt }),
            });
          }
          eventCursors.set(session.name, events.length);

          // Orchestrator state snapshot (emit only on change)
          const orchSnapshot = buildOrchestratorSnapshot(session);
          const orchHash = JSON.stringify(orchSnapshot);
          const prevHash = prevOrchHashes.get(session.name);
          if (orchHash !== prevHash) {
            stream.writeSSE({
              event: "orchestrator_state",
              data: JSON.stringify({ session: session.name, ...orchSnapshot }),
            });
            prevOrchHashes.set(session.name, orchHash);
          }

          // Task-level and agent-level diffs (existing logic)
          const detail = buildDirectoryDetail(session);
          const prevDetail = prevDetails.get(session.name);

          if (prevDetail) {
            const prevTaskMap = new Map(prevDetail.tasks.map((t) => [t.id, t]));
            for (const task of detail.tasks) {
              const prevTask = prevTaskMap.get(task.id);
              if (!prevTask) {
                stream.writeSSE({
                  event: "task_update",
                  data: JSON.stringify({
                    session: session.name,
                    taskId: task.id,
                    status: task.status,
                    title: task.title,
                  }),
                });
              } else if (prevTask.status !== task.status || prevTask.assignee !== task.assignee) {
                stream.writeSSE({
                  event: "task_update",
                  data: JSON.stringify({
                    session: session.name,
                    taskId: task.id,
                    status: task.status,
                    assignee: task.assignee,
                  }),
                });
              }
            }

            // Detect agent status changes
            const prevAgentMap = new Map(prevDetail.agents.map((a) => [a.paneTitle, a]));
            for (const agent of detail.agents) {
              const prevAgent = prevAgentMap.get(agent.paneTitle);
              if (!prevAgent || prevAgent.isBusy !== agent.isBusy) {
                stream.writeSSE({
                  event: "agent_status",
                  data: JSON.stringify({
                    session: session.name,
                    agent: agent.paneTitle,
                    busy: agent.isBusy,
                    taskId: agent.taskId,
                  }),
                });
              }
            }
          }

          prevDetails.set(session.name, detail);
        }

        prevOverviews = overviews;
      };

      // Initial snapshot
      poll();

      // Poll every 2 seconds
      while (true) {
        await stream.sleep(2000);
        poll();
      }
    });
  });

  // --- HQ endpoints ---

  const remoteRegistry = options.remoteRegistry ?? null;

  app.post("/api/hq/register", async (c) => {
    if (!remoteRegistry) return c.json({ error: "HQ registry not enabled" }, 501);
    const body = await c.req.json();
    const parsed = RegistrationPayloadSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400);
    try {
      const machine = remoteRegistry.register(parsed.data);
      return c.json({
        ok: true,
        id: machine.id,
        name: machine.name,
        registeredAt: machine.registeredAt.toISOString(),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });

  app.get("/api/hq/machines", (c) => {
    if (!remoteRegistry) return c.json({ machines: [] });
    const machines = remoteRegistry.getMachines().map((m) => ({
      id: m.id,
      name: m.name,
      url: m.url,
      registeredAt: m.registeredAt.toISOString(),
      lastHeartbeat: m.lastHeartbeat.toISOString(),
      sessions: Array.from(m.sessionIds),
    }));
    return c.json({ machines });
  });

  app.get("/api/hq/machines/:id", (c) => {
    if (!remoteRegistry) return c.json({ error: "HQ registry not enabled" }, 501);
    const machine = remoteRegistry.getMachine(c.req.param("id"));
    if (!machine) return c.json({ error: "Machine not found" }, 404);
    return c.json({
      id: machine.id,
      name: machine.name,
      url: machine.url,
      registeredAt: machine.registeredAt.toISOString(),
      lastHeartbeat: machine.lastHeartbeat.toISOString(),
      sessions: Array.from(machine.sessionIds),
    });
  });

  app.delete("/api/hq/machines/:id", (c) => {
    if (!remoteRegistry) return c.json({ error: "HQ registry not enabled" }, 501);
    const removed = remoteRegistry.unregister(c.req.param("id"));
    if (!removed) return c.json({ error: "Machine not found" }, 404);
    return c.json({ ok: true });
  });

  // --- Tunnel endpoints ---

  const tunnelManager = options.tunnelManager ?? null;

  app.get("/api/tunnel", async (c) => {
    if (!tunnelManager) return c.json({ running: false, provider: null });
    const status = await tunnelManager.status();
    return c.json(status);
  });

  app.post("/api/tunnel/start", async (c) => {
    if (!tunnelManager) return c.json({ error: "Tunnel manager not configured" }, 501);
    const body = await c.req.json().catch(() => ({}));
    const { tunnelConfigSchema } = await import("../lib/tunnels/types.ts");
    const parsed = tunnelConfigSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "Invalid tunnel config", details: parsed.error.issues }, 400);
    const status = await tunnelManager.start(parsed.data);
    return c.json(status);
  });

  app.post("/api/tunnel/stop", async (c) => {
    if (!tunnelManager) return c.json({ error: "Tunnel manager not configured" }, 501);
    await tunnelManager.stop();
    return c.json({ ok: true });
  });

  // Health check for daemon liveness probes
  app.get("/health", (c) => {
    return c.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      version: pkgVersion,
    });
  });

  // Serve the Next.js static dashboard for all non-API routes
  app.use("*", serveDashboard());

  return app;
}
