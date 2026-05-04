import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  statSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import {
  discoverSessions,
  buildOverviews,
  buildProjectDetail,
  buildOrchestratorSnapshot,
  updateTask,
  type SessionOverview,
  type ProjectDetail,
} from "./discovery.ts";
import {
  listSessionPanes,
  sendCommand,
  sendEnterToPane,
  sendLiteralToPane,
  sendText,
  getPaneBusyStatus,
} from "../widgets/lib/pane-comms.ts";
import { resolvePane } from "../send.ts";
import { getSessionState, killSession, stopSessionMonitor } from "../lib/tmux.ts";
import { readConfig, writeConfig } from "../lib/yaml-io.ts";
import {
  ensureTasksDir,
  nextTaskId,
  saveTask,
  deleteTask,
  loadMission,
  saveMission,
  loadTasks,
  taskStore,
  getTaskStoreMetrics,
  type Task,
  type TaskStoreChangeEvent,
} from "../lib/task-store.ts";
import { readEvents, appendEvent, eventLogEmitter } from "../lib/event-log.ts";
import { extractMarks, calculateStats, tagContent } from "../lib/authorship.ts";
import {
  loadValidationState,
  loadValidationContract,
  saveValidationState,
  checkCoverage,
} from "../lib/validation.ts";
import { loadSkills, loadSkill } from "../lib/skill-registry.ts";
import { computeMetrics, loadMissionHistory } from "../lib/metrics.ts";
import { loadPlans, markPlanDone } from "../lib/plan-store.ts";
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
  savePlanContentSchema,
  sendCommandSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  updateAssertionSchema,
  triggerResearchSchema,
} from "./schemas.ts";
import { AuthService } from "../lib/auth/auth-service.ts";
import { authMiddleware } from "../lib/auth/middleware.ts";
import type { AuthConfig } from "../lib/auth/types.ts";
import { TunnelManager } from "../lib/tunnels/manager.ts";
import { RemoteRegistry } from "../lib/hq/registry.ts";
import { RegistrationPayloadSchema } from "../lib/hq/types.ts";
import { dispatchResearch, loadResearchState } from "../lib/research.ts";
import { serveDashboard } from "./static.ts";
import { getOrchestratorHealth, getPaneContentHashMetrics } from "../lib/orchestrator.ts";
import { handleWsEventsConnection, broadcastInitOutput, broadcastInitError } from "./ws-events.ts";
import {
  listProjects,
  getProject,
  registerProject,
  unregisterProject,
  refreshProject,
  ProjectAlreadyRegisteredError,
  ProjectDirNotFoundError,
  ProjectNotFoundError,
} from "../lib/project-registry.ts";
import {
  runInit,
  ProjectInitFailedError,
  ProjectInitTimeoutError,
} from "../lib/project-init-runner.ts";
import {
  RegisterProjectRequestSchemaZ,
  InitProjectRequestSchemaZ,
  type ProjectTemplate,
} from "../schemas/registry.ts";
import {
  InspectFilesystemRequestSchemaZ,
  OnboardProjectRequestSchemaZ,
} from "../schemas/inspect.ts";
import {
  browseDirectory,
  InvalidPathError,
  PathNotFoundError,
  SandboxViolationError,
  assertInsideSandbox,
} from "../lib/filesystem-browser.ts";
import { inspectProject, InspectDirNotFoundError } from "../lib/project-inspect.ts";
import {
  composeIdeYmlConfig,
  assertNoExistingIdeYml,
  OnboardConflictError,
  OnboardInvalidInputError,
} from "../lib/project-onboard.ts";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve as pathResolve } from "node:path";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

export interface CreateAppOptions {
  authService?: AuthService;
  authConfig?: AuthConfig;
  tunnelManager?: TunnelManager;
  remoteRegistry?: RemoteRegistry;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgVersion: string = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
).version;
let projectStreamConnections = 0;

const ALLOWED_MILESTONE_TRANSITIONS = new Map([
  ["locked", new Set(["active"])],
  ["active", new Set(["validating"])],
  ["validating", new Set(["done", "active"])],
  ["done", new Set<string>()],
]);

const sseMetrics = {
  connections: 0,
  messagesSent: 0,
};

export function getSseMetrics(): { connections: number; messagesSent: number } {
  return { ...sseMetrics };
}

function freezePayload<T>(payload: T): T {
  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      freezePayload(value);
    }
    Object.freeze(payload);
  }
  return payload;
}

function isPathInside(path: string | null | undefined, root: string): boolean {
  if (!path) return false;
  return path === root || path.startsWith(root + "/");
}

function safePlanName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9_\-. ]/g, "");
}

function planFilePath(projectDir: string, filename: string): string {
  const safeName = safePlanName(filename);
  return join(projectDir, "plans", safeName.endsWith(".md") ? safeName : `${safeName}.md`);
}

function writePlanAtomic(filePath: string, content: string): number {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, filePath);
  } finally {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best effort cleanup; the real write has either completed or failed.
      }
    }
  }
  return statSync(filePath).mtimeMs;
}

function parsePlanFrontmatterSummary(content: string): {
  owner: string | null;
  status: string | null;
} {
  if (!content.startsWith("---\n")) return { owner: null, status: null };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { owner: null, status: null };
  let owner: string | null = null;
  let status: string | null = null;
  for (const line of content.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim().replace(/^["']|["']$/g, "");
    if (key === "owner") owner = value;
    if (key === "status") status = value.toLowerCase().replace(/\s+/g, "-");
  }
  return { owner, status };
}

function patchPlanStatus(content: string, status: string): string {
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) {
      const block = content.slice(4, end);
      const rest = content.slice(end);
      if (/^status:\s*.*$/im.test(block)) {
        return `---\n${block.replace(/^status:\s*.*$/im, `status: ${status}`)}${rest}`;
      }
      return `---\nstatus: ${status}\n${block}${rest}`;
    }
  }

  if (/\*\*Status:\*\*\s*`[^`]+`/.test(content)) {
    return content.replace(/\*\*Status:\*\*\s*`[^`]+`/, `**Status:** \`${status}\``);
  }
  return `---\nstatus: ${status}\n---\n${content}`;
}

function isValidMilestoneTransition(
  from: "locked" | "active" | "done" | "validating",
  to: "locked" | "active" | "done" | "validating",
): boolean {
  if (from === to) return true;
  return ALLOWED_MILESTONE_TRANSITIONS.get(from)?.has(to) ?? false;
}

type DiscoveredSession = ReturnType<typeof discoverSessions>[number];

function validationSummary(dir: string): {
  total: number;
  passing: number;
  failing: number;
  pending: number;
  blocked: number;
} {
  const valState = loadValidationState(dir);
  const assertions = valState ? Object.values(valState.assertions) : [];
  return {
    total: assertions.length,
    passing: assertions.filter((a) => a.status === "passing").length,
    failing: assertions.filter((a) => a.status === "failing").length,
    pending: assertions.filter((a) => a.status === "pending").length,
    blocked: assertions.filter((a) => a.status === "blocked").length,
  };
}

function buildProjectStreamSnapshot(session: DiscoveredSession) {
  const project = buildProjectDetail(session);
  const mission = loadMission(session.dir);
  const tasks = loadTasks(session.dir);
  const milestones = mission
    ? [...mission.milestones]
        .sort((a, b) => a.order - b.order)
        .map((milestone) => {
          const milestoneTasks = tasks.filter((task) => task.milestone === milestone.id);
          return {
            ...milestone,
            taskCount: milestoneTasks.length,
            tasksDone: milestoneTasks.filter((task) => task.status === "done").length,
          };
        })
    : [];

  return {
    project,
    mission: mission ? { mission, validationSummary: validationSummary(session.dir) } : null,
    milestones,
    goals: project.goals,
    tasks: project.tasks,
    skills: loadSkills(session.dir),
    agents: project.agents,
    events: readEvents(session.dir).slice(-100).reverse(),
  };
}

/**
 * Resolve a user-supplied directory to a canonical absolute path and verify
 * it lives inside the filesystem-browser sandbox. Used by `/api/filesystem/
 * inspect` and `/api/projects/onboard` so unregistered directories get the
 * same protection as the directory browser. Returns either the canonical
 * path or a structured error suitable for `c.json`.
 *
 * Tilde-expansion mirrors `/api/filesystem/browse`: `~` and `~/sub` map to
 * `homedir()`. The sandbox roots are owned by `assertInsideSandbox`.
 */
type SandboxResolveOk = { canonical: string };
type SandboxResolveErr = {
  error: "invalid-path" | "not-found" | "outside-sandbox";
  message: string;
  status: 400 | 403 | 404;
};
function sandboxResolveDir(rawDir: string): SandboxResolveOk | SandboxResolveErr {
  const trimmed = rawDir.trim();
  if (!trimmed) return { error: "invalid-path", message: "Path must not be empty", status: 400 };
  if (trimmed.includes("\0")) {
    return { error: "invalid-path", message: "Path contains a null byte", status: 400 };
  }
  const home =
    process.env.TMUX_IDE_HOME_OVERRIDE && process.env.TMUX_IDE_HOME_OVERRIDE.trim().length > 0
      ? process.env.TMUX_IDE_HOME_OVERRIDE
      : homedir();
  let candidate = trimmed;
  if (candidate === "~") {
    candidate = home;
  } else if (candidate.startsWith("~/")) {
    candidate = `${home.replace(/\/+$/, "")}/${candidate.slice(2)}`;
  }
  if (!isAbsolute(candidate)) {
    return { error: "invalid-path", message: "Path must be absolute", status: 400 };
  }
  const resolved = pathResolve(candidate);
  let canonical: string;
  try {
    canonical = realpathSync(resolved);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        error: "not-found",
        message: `Path "${resolved}" does not exist`,
        status: 404,
      };
    }
    throw err;
  }
  try {
    assertInsideSandbox(canonical, home);
  } catch (err) {
    if (err instanceof SandboxViolationError) {
      return { error: "outside-sandbox", message: err.message, status: 403 };
    }
    throw err;
  }
  return { canonical };
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const authConfig: AuthConfig = options.authConfig ?? { method: "none", token_expiry: 86400 };
  const authService = options.authService ?? new AuthService();

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

  app.get("/api/project/:name", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    const detail = buildProjectDetail(session);
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

  app.get("/api/project/:name/panes", (c) => {
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

  app.post("/api/project/:name/task/:id", zValidator("json", updateTaskSchema), async (c) => {
    const name = c.req.param("name");
    const taskId = c.req.param("id");

    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = c.req.valid("json");
    const updated = updateTask(session.dir, taskId, body);
    if (!updated) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json({ ok: true, task: updated });
  });

  // Create task
  app.post("/api/project/:name/task", zValidator("json", createTaskSchema), async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = c.req.valid("json");

    ensureTasksDir(session.dir);
    const id = nextTaskId(session.dir);
    const now = new Date().toISOString();
    const task: Task = {
      id,
      title: body.title.trim(),
      description: body.description ?? "",
      goal: body.goal ?? null,
      status: "todo",
      assignee: null,
      priority: body.priority ?? 2,
      created: now,
      updated: now,
      tags: body.tags ?? [],
      proof: null,
      depends_on: [],
      retryCount: 0,
      maxRetries: 5,
      lastError: null,
      nextRetryAt: null,
      milestone: null,
      specialty: null,
      fulfills: [],
      discoveredIssues: [],
      salientSummary: null,
    };
    saveTask(session.dir, task);
    return c.json({ ok: true, task }, 201);
  });

  // Delete task
  app.delete("/api/project/:name/task/:id", (c) => {
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
  app.get("/api/project/:name/plans", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const plans = loadPlans(session.dir).map((p) => {
      const filePath = join(session.dir, "plans", `${p.name}.md`);
      const raw = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
      const frontmatter = parsePlanFrontmatterSummary(raw);
      return {
        name: p.name,
        path: `${p.name}.md`,
        title: p.title,
        status: frontmatter.status ?? p.status,
        effort: p.effort ?? null,
        owner: frontmatter.owner,
        updated: existsSync(filePath) ? statSync(filePath).mtime.toISOString() : null,
        completed: p.completed ?? null,
      };
    });

    return c.json({ plans });
  });

  // Read a single plan file
  app.get("/api/project/:name/plans/:filename", (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Sanitize filename — no path traversal
    const safeName = safePlanName(filename);
    const filePath = planFilePath(session.dir, filename);

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
      mtime: statSync(filePath).mtimeMs,
    });
  });

  // Save a plan file (with authorship tagging)
  app.post("/api/project/:name/plans/:filename", zValidator("json", savePlanSchema), async (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const body = c.req.valid("json");

    const filePath = planFilePath(session.dir, filename);

    // Auto-tag uncovered character ranges as human-authored
    const tagged = tagContent(body.content, "human");
    const mtime = writePlanAtomic(filePath, tagged);

    return c.json({ ok: true, mtime });
  });

  app.post(
    "/api/project/:name/plans/:filename/content",
    zValidator("json", savePlanContentSchema),
    async (c) => {
      const name = c.req.param("name");
      const filename = c.req.param("filename");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }

      const filePath = planFilePath(session.dir, filename);
      if (!existsSync(filePath)) {
        return c.json({ error: "Plan not found" }, 404);
      }

      const body = c.req.valid("json");
      const mtime = writePlanAtomic(filePath, body.content);
      return c.json({ ok: true, mtime });
    },
  );

  // Delete a plan file
  app.delete("/api/project/:name/plans/:filename", (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const safeName = safePlanName(filename);
    const filePath = planFilePath(session.dir, filename);

    if (!existsSync(filePath)) {
      return c.json({ error: "Plan not found" }, 404);
    }

    unlinkSync(filePath);
    return c.json({ ok: true, deleted: safeName });
  });

  // Mark a plan as done
  app.post("/api/project/:name/plans/:filename/done", (c) => {
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

  app.post("/api/project/:name/plans/:filename/status", async (c) => {
    const name = c.req.param("name");
    const filename = c.req.param("filename");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const status = (body as { status?: unknown })?.status;
    if (
      status !== "pending" &&
      status !== "in-progress" &&
      status !== "done" &&
      status !== "archived"
    ) {
      return c.json({ error: "Invalid status" }, 400);
    }

    if (status === "done") {
      const safeName = safePlanName(filename).replace(/\.md$/, "");
      const result = markPlanDone(session.dir, safeName);
      if (!result) return c.json({ error: "Plan not found" }, 404);
      return c.json({ ok: true, plan: result });
    }

    const filePath = planFilePath(session.dir, filename);
    if (!existsSync(filePath)) {
      return c.json({ error: "Plan not found" }, 404);
    }
    const patched = patchPlanStatus(readFileSync(filePath, "utf-8"), status);
    const mtime = writePlanAtomic(filePath, patched);
    return c.json({ ok: true, mtime });
  });

  // --- Checkpoints ---

  app.get("/api/project/:name/checkpoints", (c) => {
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

  app.get("/api/project/:name/checkpoints/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const cp = loadCheckpoint(session.dir, id);
    if (!cp) return c.json({ error: "Checkpoint not found" }, 404);
    return c.json({ checkpoint: cp });
  });

  app.post("/api/project/:name/checkpoints", async (c) => {
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

  app.post("/api/project/:name/checkpoints/:id", async (c) => {
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

  app.delete("/api/project/:name/checkpoints/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (!deleteCheckpoint(session.dir, id)) return c.json({ error: "Checkpoint not found" }, 404);
    return c.json({ ok: true, deleted: id });
  });

  // --- Reviews ---

  app.get("/api/project/:name/reviews", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const taskId = c.req.query("task");
    const list = taskId ? loadReviewsForTask(session.dir, taskId) : loadReviews(session.dir);
    return c.json({ reviews: list });
  });

  app.get("/api/project/:name/reviews/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const review = loadReview(session.dir, id);
    if (!review) return c.json({ error: "Review not found" }, 404);
    return c.json({ review });
  });

  app.post("/api/project/:name/reviews", async (c) => {
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

  app.post("/api/project/:name/reviews/:id", async (c) => {
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

  app.post("/api/project/:name/reviews/:id/comment", async (c) => {
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

  app.delete("/api/project/:name/reviews/:id", (c) => {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (!deleteReview(session.dir, id)) return c.json({ error: "Review not found" }, 404);
    return c.json({ ok: true, deleted: id });
  });

  app.get("/api/project/:name/diff", (c) => {
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
  app.get("/api/project/:name/diff/:file{.+}", (c) => {
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

  app.get("/api/project/:name/milestones", (c) => {
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

  app.get("/api/project/:name/milestones/:id", (c) => {
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
    "/api/project/:name/milestones",
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

  app.post(
    "/api/project/:name/milestones/:id",
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

  app.get("/api/project/:name/validation", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const state = loadValidationState(session.dir);
    const contract = loadValidationContract(session.dir);
    return c.json({ contract: contract ?? null, state: state ?? null });
  });

  app.get("/api/project/:name/validation/coverage", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(checkCoverage(session.dir));
  });

  app.post(
    "/api/project/:name/validation/assert/:assertId",
    zValidator("json", updateAssertionSchema),
    async (c) => {
      const name = c.req.param("name");
      const assertId = c.req.param("assertId");
      const sessions = discoverSessions();
      const session = sessions.find((s) => s.name === name);
      if (!session) return c.json({ error: "Session not found" }, 404);
      const body = c.req.valid("json");
      ensureTasksDir(session.dir);
      const state = loadValidationState(session.dir) ?? { assertions: {}, lastVerified: null };
      state.assertions[assertId] = {
        status: body.status,
        verifiedBy: body.verifiedBy ?? null,
        verifiedAt: new Date().toISOString(),
        evidence: body.evidence ?? null,
        blockedBy: body.status === "blocked" ? (body.evidence ?? null) : null,
      };
      state.lastVerified = new Date().toISOString();
      saveValidationState(session.dir, state);
      return c.json({ ok: true, assertionId: assertId, ...state.assertions[assertId] });
    },
  );

  app.get("/api/project/:name/research", (c) => {
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
    "/api/project/:name/research/trigger",
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
          inflightDispatches: new Map(),
          completedDispatches: new Set(),
          stallNudges: new Map(),
          totalDispatched: 0,
          totalCompleted: 0,
          totalFailed: 0,
          lastTickMs: 0,
          ticking: false,
          idleAgents: 0,
          queuedDispatches: 0,
          lastError: null,
          lastReconcileMs: 0,
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

  app.get("/api/project/:name/skills", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    const skills = loadSkills(session.dir);
    return c.json({ skills });
  });

  app.get("/api/project/:name/skills/:skillName", (c) => {
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

  app.get("/api/project/:name/mission", (c) => {
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

  app.post("/api/project/:name/mission/plan-complete", async (c) => {
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

  // --- Metrics endpoints ---

  app.get("/api/project/:name/metrics", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(computeMetrics(session.dir));
  });

  app.get("/api/project/:name/metrics/agents", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ agents: computeMetrics(session.dir).agents });
  });

  app.get("/api/project/:name/metrics/timeline", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ timeline: computeMetrics(session.dir).timeline });
  });

  app.get("/api/project/:name/metrics/history", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ history: loadMissionHistory(session.dir) });
  });

  // Events endpoint — returns recent orchestrator events
  app.get("/api/project/:name/events", (c) => {
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

  app.get("/api/project/:name/stream", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      projectStreamConnections += 1;
      sseMetrics.connections = projectStreamConnections;
      let closed = false;
      let changeQueued = false;
      let previousSnapshotHash = "";
      let previousTaskHashes = new Map<string, string>();
      let previousGoalHashes = new Map<string, string>();
      let previousMilestoneHashes = new Map<string, string>();
      let previousAgentHashes = new Map<string, string>();
      let previousMissionHash = "";
      let eventCursor = 0;
      let lastPing = Date.now();
      const tasksRoot = join(session.dir, ".tasks");

      function writeSse(event: string, payload: unknown): void {
        sseMetrics.messagesSent += 1;
        void stream.writeSSE({ event, data: JSON.stringify(freezePayload(payload)) });
      }

      function writeSnapshot(currentSession: DiscoveredSession): void {
        const snapshot = buildProjectStreamSnapshot(currentSession);
        previousSnapshotHash = JSON.stringify(snapshot);
        previousTaskHashes = new Map(snapshot.tasks.map((task) => [task.id, JSON.stringify(task)]));
        previousGoalHashes = new Map(snapshot.goals.map((goal) => [goal.id, JSON.stringify(goal)]));
        previousMilestoneHashes = new Map(
          snapshot.milestones.map((milestone) => [milestone.id, JSON.stringify(milestone)]),
        );
        previousAgentHashes = new Map(
          snapshot.agents.map((agent) => [agent.paneId, JSON.stringify(agent)]),
        );
        previousMissionHash = JSON.stringify(snapshot.mission);
        eventCursor = readEvents(currentSession.dir).length;
        writeSse("snapshot", snapshot);
      }

      function writeChanges(currentSession: DiscoveredSession): void {
        const snapshot = buildProjectStreamSnapshot(currentSession);
        const snapshotHash = JSON.stringify(snapshot);
        if (!previousSnapshotHash) {
          writeSnapshot(currentSession);
          return;
        }

        const missionHash = JSON.stringify(snapshot.mission);
        if (missionHash !== previousMissionHash) {
          writeSse("mission.changed", {});
          previousMissionHash = missionHash;
        }

        const nextTaskHashes = new Map(
          snapshot.tasks.map((task) => [task.id, JSON.stringify(task)]),
        );
        for (const task of snapshot.tasks) {
          if (nextTaskHashes.get(task.id) !== previousTaskHashes.get(task.id)) {
            const op = previousTaskHashes.has(task.id) ? "update" : "create";
            writeSse("task.changed", { id: task.id, op });
          }
        }
        for (const id of previousTaskHashes.keys()) {
          if (!nextTaskHashes.has(id)) {
            writeSse("task.changed", { id, op: "delete" });
          }
        }
        previousTaskHashes = nextTaskHashes;

        const nextGoalHashes = new Map(
          snapshot.goals.map((goal) => [goal.id, JSON.stringify(goal)]),
        );
        for (const goal of snapshot.goals) {
          if (nextGoalHashes.get(goal.id) !== previousGoalHashes.get(goal.id)) {
            const op = previousGoalHashes.has(goal.id) ? "update" : "create";
            writeSse("goal.changed", { id: goal.id, op });
          }
        }
        for (const id of previousGoalHashes.keys()) {
          if (!nextGoalHashes.has(id)) {
            writeSse("goal.changed", { id, op: "delete" });
          }
        }
        previousGoalHashes = nextGoalHashes;

        const nextMilestoneHashes = new Map(
          snapshot.milestones.map((milestone) => [milestone.id, JSON.stringify(milestone)]),
        );
        for (const milestone of snapshot.milestones) {
          if (nextMilestoneHashes.get(milestone.id) !== previousMilestoneHashes.get(milestone.id)) {
            const op = previousMilestoneHashes.has(milestone.id) ? "update" : "create";
            writeSse("milestone.changed", { id: milestone.id, op });
          }
        }
        for (const id of previousMilestoneHashes.keys()) {
          if (!nextMilestoneHashes.has(id)) {
            writeSse("milestone.changed", { id, op: "delete" });
          }
        }
        previousMilestoneHashes = nextMilestoneHashes;

        const nextAgentHashes = new Map(
          snapshot.agents.map((agent) => [agent.paneId, JSON.stringify(agent)]),
        );
        for (const agent of snapshot.agents) {
          if (nextAgentHashes.get(agent.paneId) !== previousAgentHashes.get(agent.paneId)) {
            writeSse("agent.changed", {
              paneId: agent.paneId,
              status: agent.isBusy ? "busy" : "idle",
            });
          }
        }
        previousAgentHashes = nextAgentHashes;

        const events = readEvents(currentSession.dir);
        const effectiveCursor = events.length < eventCursor ? 0 : eventCursor;
        for (const event of events.slice(effectiveCursor)) {
          writeSse("event.appended", event);
        }
        eventCursor = events.length;

        if (snapshotHash !== previousSnapshotHash) {
          writeSse("snapshot", snapshot);
          previousSnapshotHash = snapshotHash;
        }
      }

      function queueChanges(): void {
        if (closed || changeQueued) return;
        changeQueued = true;
        queueMicrotask(() => {
          changeQueued = false;
          const current = discoverSessions().find((candidate) => candidate.name === name);
          if (current) writeChanges(current);
        });
      }

      const onTaskStoreChange = (change: TaskStoreChangeEvent) => {
        if (!isPathInside(change.path, tasksRoot) && change.path !== null) return;
        queueChanges();
      };

      const onEventAppended = (message: { dir: string; event: unknown }) => {
        if (message.dir !== session.dir) return;
        queueChanges();
      };

      try {
        stream.onAbort(() => {
          closed = true;
        });
        taskStore.on("change", onTaskStoreChange);
        eventLogEmitter.on("event", onEventAppended);
        writeSnapshot(session);
        while (!closed) {
          await stream.sleep(250);
          const current = discoverSessions().find((candidate) => candidate.name === name);
          if (!current) break;
          writeChanges(current);
          const now = Date.now();
          if (now - lastPing >= 25_000) {
            writeSse("ping", { at: new Date().toISOString() });
            lastPing = now;
          }
        }
      } finally {
        closed = true;
        taskStore.off("change", onTaskStoreChange);
        eventLogEmitter.off("event", onEventAppended);
        projectStreamConnections = Math.max(0, projectStreamConnections - 1);
        sseMetrics.connections = projectStreamConnections;
      }
    });
  });

  app.get("/api/daemon/metrics", (c) => {
    const metrics = getTaskStoreMetrics();
    return c.json({
      uptimeMs: metrics.uptimeMs,
      cache: metrics.cache,
      watcher: metrics.watcher,
      reconcile: metrics.reconcile,
      sse: getSseMetrics(),
      writes: metrics.writes,
      paneContentHash: getPaneContentHashMetrics(),
    });
  });

  app.get("/api/project/:name/orchestrator/health", (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const live = getOrchestratorHealth(name);
    if (live) return c.json(live);

    const tasks = loadTasks(session.dir);
    const panes: ReturnType<typeof listSessionPanes> = (() => {
      try {
        return listSessionPanes(name);
      } catch {
        return [];
      }
    })();
    const inProgress = tasks.filter((task) => task.status === "in-progress");
    const busyAssignees = new Set(inProgress.map((task) => task.assignee).filter(Boolean));
    const idleAgents = panes.filter((pane) => {
      if (pane.role === "lead") return false;
      const agentName = pane.name ?? pane.title;
      return !busyAssignees.has(agentName);
    }).length;

    return c.json({
      ticking: false,
      lastTickMs: 0,
      inflight: inProgress.length,
      idleAgents,
      queuedDispatches: tasks.filter((task) => task.status === "todo").length,
      lastError: null,
      totalDispatched: 0,
      totalCompleted: tasks.filter((task) => task.status === "done").length,
      totalFailed: tasks.filter((task) => task.status === "review").length,
    });
  });

  // --- Remote command execution endpoints ---

  app.post("/api/project/:name/inject", async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const text = (body as { text?: unknown }).text;
    const paneId = (body as { paneId?: unknown }).paneId;
    const sendEnter = (body as { sendEnter?: unknown }).sendEnter;

    if (typeof text !== "string" || text.trim().length === 0) {
      return c.json({ error: "text must be a non-empty string" }, 400);
    }
    if (paneId !== undefined && (typeof paneId !== "string" || !/^%\d+$/.test(paneId))) {
      return c.json({ error: "paneId must match /^%\\d+$/" }, 400);
    }
    if (sendEnter !== undefined && typeof sendEnter !== "boolean") {
      return c.json({ error: "sendEnter must be a boolean" }, 400);
    }

    const panes = listSessionPanes(name);
    const pane = paneId
      ? panes.find((candidate) => candidate.id === paneId)
      : panes.find((p) => p.active);
    if (!pane) {
      return c.json({ error: "Pane not found" }, 404);
    }

    sendLiteralToPane(name, pane.id, text);
    if (sendEnter) sendEnterToPane(name, pane.id);

    appendEvent(session.dir, {
      timestamp: new Date().toISOString(),
      type: "send",
      target: pane.name ?? pane.title,
      paneId: pane.id,
      message: text.length > 100 ? text.slice(0, 100) + "..." : text,
    });

    return c.json({ ok: true });
  });

  // Send message to a pane by name/title/role/ID
  app.post("/api/project/:name/send", zValidator("json", sendCommandSchema), async (c) => {
    const name = c.req.param("name");
    const sessions = discoverSessions();
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const { target, message, noEnter } = c.req.valid("json");

    const panes = listSessionPanes(name);
    const pane = resolvePane(panes, target);
    if (!pane) {
      const available = panes.map((p) => ({
        id: p.id,
        title: p.title,
        name: p.name,
        role: p.role,
      }));
      return c.json({ error: "Pane not found", target, available }, 404);
    }

    const busyStatus = getPaneBusyStatus(name, pane.id);

    // Collapse multiline for agent panes
    const prepared = busyStatus === "agent" ? message.replace(/\n+/g, " ").trim() : message;

    if (noEnter) {
      sendText(name, pane.id, prepared);
    } else {
      sendCommand(name, pane.id, prepared);
    }

    appendEvent(session.dir, {
      timestamp: new Date().toISOString(),
      type: "send",
      target: pane.name ?? pane.title,
      paneId: pane.id,
      message: prepared.length > 100 ? prepared.slice(0, 100) + "..." : prepared,
    });

    return c.json({
      ok: true,
      session: name,
      target: {
        paneId: pane.id,
        name: pane.name,
        title: pane.title,
        role: pane.role,
      },
      busyStatus,
    });
  });

  // Launch a tmux-ide session (shells out to CLI since launch has complex side effects)
  const execFileAsync = promisify(execFile);

  app.post("/api/project/:name/launch", async (c) => {
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
  app.post("/api/project/:name/stop", async (c) => {
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
      let prevDetails = new Map<string, ProjectDetail>();
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
          const detail = buildProjectDetail(session);
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

  // --- Project registry ---

  app.get("/api/projects", (c) => {
    return c.json({ projects: listProjects() });
  });

  app.get("/api/projects/templates", (c) => {
    return c.json({ templates: listAvailableTemplates() });
  });

  app.post("/api/projects", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = RegisterProjectRequestSchemaZ.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
    }
    try {
      const project = await registerProject({
        dir: parsed.data.dir,
        name: parsed.data.name,
      });
      return c.json({ project }, 201);
    } catch (err) {
      if (err instanceof ProjectDirNotFoundError) {
        return c.json({ error: err.message, code: err.code }, 400);
      }
      if (err instanceof ProjectAlreadyRegisteredError) {
        return c.json({ error: err.message, code: err.code, suggestion: err.suggestion }, 409);
      }
      throw err;
    }
  });

  app.delete("/api/projects/:name", (c) => {
    const name = c.req.param("name");
    try {
      unregisterProject(name);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        return c.json({ error: err.message, code: err.code }, 404);
      }
      throw err;
    }
  });

  app.get("/api/filesystem/browse", (c) => {
    const rawPath = c.req.query("path");
    const showHiddenRaw = c.req.query("showHidden");
    const showHidden = showHiddenRaw === "1" || showHiddenRaw === "true";
    try {
      const result = browseDirectory({
        path: rawPath ?? null,
        showHidden,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof SandboxViolationError) {
        return c.json({ error: "outside-sandbox", message: err.message }, 403);
      }
      if (err instanceof PathNotFoundError) {
        return c.json({ error: "not-found", message: err.message }, 404);
      }
      if (err instanceof InvalidPathError) {
        return c.json({ error: "invalid-path", message: err.message }, 400);
      }
      throw err;
    }
  });

  app.post("/api/projects/:name/probe", async (c) => {
    const name = c.req.param("name");
    if (!getProject(name)) {
      return c.json({ error: `Project "${name}" not found in registry`, code: "NOT_FOUND" }, 404);
    }
    try {
      const project = await refreshProject(name);
      return c.json({ project });
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        return c.json({ error: err.message, code: err.code }, 404);
      }
      throw err;
    }
  });

  app.post("/api/projects/init", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = InitProjectRequestSchemaZ.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
    }
    if (!existsSync(parsed.data.dir)) {
      return c.json({ error: `Directory "${parsed.data.dir}" does not exist` }, 400);
    }

    const jobId = randomUUID();
    const command = process.env.TMUX_IDE_INIT_COMMAND ?? "tmux-ide";

    // Fire-and-forget — runs in the background and streams chunks via WS.
    void (async () => {
      try {
        await runInit({
          cwd: parsed.data.dir,
          template: parsed.data.template,
          command,
          onChunk: (chunk) => {
            broadcastInitOutput(jobId, chunk);
          },
        });
        // Mark stream complete
        broadcastInitOutput(jobId, "", true);

        // Probe + register the freshly-init'd project so it shows up in
        // the registry — also broadcasts `projects.changed`.
        try {
          await registerProject({ dir: parsed.data.dir });
        } catch (err) {
          // Already-registered is benign here; report anything else.
          if (
            !(err instanceof ProjectAlreadyRegisteredError) &&
            !(err instanceof ProjectDirNotFoundError)
          ) {
            broadcastInitError(jobId, (err as Error).message);
          }
        }
      } catch (err) {
        if (err instanceof ProjectInitTimeoutError) {
          broadcastInitError(jobId, err.message);
        } else if (err instanceof ProjectInitFailedError) {
          broadcastInitError(jobId, err.message);
        } else {
          broadcastInitError(jobId, (err as Error).message);
        }
      }
    })();

    return c.json({ jobId }, 202);
  });

  // -------------------------------------------------------------------------
  // POST /api/filesystem/inspect — registry-agnostic directory inspection.
  // POST /api/projects/onboard   — generate ide.yml + register the project.
  // -------------------------------------------------------------------------

  app.post("/api/filesystem/inspect", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid-path", message: "Invalid JSON body" }, 400);
    }
    const parsed = InspectFilesystemRequestSchemaZ.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid-path", message: "Invalid request" }, 400);
    }
    const sandboxResult = sandboxResolveDir(parsed.data.dir);
    if ("error" in sandboxResult) {
      return c.json(
        { error: sandboxResult.error, message: sandboxResult.message },
        sandboxResult.status,
      );
    }
    try {
      const project = await inspectProject(sandboxResult.canonical);
      return c.json({ project });
    } catch (err) {
      if (err instanceof InspectDirNotFoundError) {
        return c.json({ error: "not-found", message: err.message }, 404);
      }
      throw err;
    }
  });

  app.post("/api/projects/onboard", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = OnboardProjectRequestSchemaZ.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
    }
    const sandboxResult = sandboxResolveDir(parsed.data.dir);
    if ("error" in sandboxResult) {
      return c.json(
        { error: sandboxResult.error, message: sandboxResult.message },
        sandboxResult.status,
      );
    }

    const dir = sandboxResult.canonical;
    let inspect;
    try {
      inspect = await inspectProject(dir);
    } catch (err) {
      if (err instanceof InspectDirNotFoundError) {
        return c.json({ error: "not-found", message: err.message }, 404);
      }
      throw err;
    }

    // Never overwrite an existing ide.yml.
    try {
      assertNoExistingIdeYml(dir);
    } catch (err) {
      if (err instanceof OnboardConflictError) {
        return c.json({ error: err.message, code: err.code }, 409);
      }
      throw err;
    }

    // Compose the config from inputs (defaults to inspect.name).
    const finalName = parsed.data.name?.trim() || inspect.name;
    let config;
    try {
      config = composeIdeYmlConfig({
        name: finalName,
        agents: parsed.data.agents,
        agentNames: parsed.data.agentNames,
        devCommand: parsed.data.devCommand ?? null,
        testCommand: parsed.data.testCommand ?? null,
        lintCommand: parsed.data.lintCommand ?? null,
      });
    } catch (err) {
      if (err instanceof OnboardInvalidInputError) {
        return c.json({ error: err.message, code: err.code }, 400);
      }
      throw err;
    }

    writeConfig(dir, config);

    // Now register — this also broadcasts `projects.changed`.
    try {
      const project = await registerProject({ dir, name: finalName });
      return c.json({ project }, 201);
    } catch (err) {
      if (err instanceof ProjectAlreadyRegisteredError) {
        return c.json({ error: err.message, code: err.code, suggestion: err.suggestion }, 409);
      }
      if (err instanceof ProjectDirNotFoundError) {
        return c.json({ error: err.message, code: err.code }, 400);
      }
      throw err;
    }
  });

  // Serve the Next.js static dashboard for all non-API routes
  app.use("*", serveDashboard());

  return app;
}

/**
 * Discover bundled templates by reading `templates/*.yml`. Hardcoded
 * descriptions for the canonical set; unknown templates surface with a
 * generic label so we don't break if templates are added without updating
 * this map.
 */
function listAvailableTemplates(): ProjectTemplate[] {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = dirname(__filename);
  const templatesDir = join(__dir, "..", "..", "templates");
  if (!existsSync(templatesDir)) return [];
  const labels: Record<string, { label: string; description: string }> = {
    default: { label: "Default", description: "Single Claude pane + dev/shell row" },
    nextjs: {
      label: "Next.js",
      description: "Two Claude panes + Next.js dev server + shell",
    },
    vite: { label: "Vite", description: "Vite dev server + Claude + shell" },
    convex: {
      label: "Convex",
      description: "Convex dev + Next.js + Claude pane",
    },
    python: { label: "Python", description: "Python project with Claude + tests" },
    go: { label: "Go", description: "Go project with Claude + tests + shell" },
    "agent-team": {
      label: "Agent Team",
      description: "Lead + teammate Claude panes for coordinated multi-agent work",
    },
    "agent-team-nextjs": {
      label: "Agent Team — Next.js",
      description: "Agent team layout tuned for a Next.js app",
    },
    "agent-team-monorepo": {
      label: "Agent Team — Monorepo",
      description: "Agent team layout for monorepos with multiple apps",
    },
    missions: {
      label: "Missions",
      description: "Mission-driven layout with planner, validator, and researcher",
    },
  };
  const entries = readdirSync(templatesDir).filter((f) => f.endsWith(".yml"));
  return entries
    .map((file) => {
      const id = file.replace(/\.yml$/, "");
      const meta = labels[id];
      return {
        id,
        label: meta?.label ?? id,
        description: meta?.description ?? `Template: ${id}`,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Attach the unified `/ws/events` push channel to a Node HTTP server. The
 * daemon calls this once after binding the command-center port. Existing
 * SSE endpoints (`/api/events`, `/api/project/<name>/stream`) continue to
 * work alongside this — they will be retired in a follow-up slice.
 */
export function attachWsEvents(server: import("node:http").Server): {
  close: () => void;
} {
  const wss = new WebSocketServer({ noServer: true });

  const upgradeListener = (
    req: import("node:http").IncomingMessage,
    socket: import("node:net").Socket,
    head: Buffer,
  ): void => {
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];
    if (pathname !== "/ws/events") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleWsEventsConnection(ws);
    });
  };

  server.on("upgrade", upgradeListener);

  return {
    close: () => {
      server.off("upgrade", upgradeListener);
      wss.close();
    },
  };
}
