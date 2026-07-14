import type { SessionOverview, ProjectDetail, Task, Mark, AuthorshipStats } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function fetchSessions(): Promise<SessionOverview[]> {
  const res = await fetch(`${API_BASE}/api/sessions`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { sessions: SessionOverview[] };
  return data.sessions;
}

export interface PaneData {
  id: string;
  index: number;
  title: string;
  currentCommand: string;
  width: number;
  height: number;
  active: boolean;
  role: string | null;
  name: string | null;
  type: string | null;
}

export async function fetchPanes(name: string): Promise<PaneData[]> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/panes`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { panes: PaneData[] };
  return data.panes;
}

export async function fetchProject(name: string): Promise<ProjectDetail | null> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as ProjectDetail;
}

export interface DiffData {
  diff: string;
  files: { file: string; additions: number; deletions: number }[];
}

export async function fetchDiff(name: string): Promise<DiffData | null> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/diff`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as DiffData;
}

export async function fetchFileDiff(name: string, filePath: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/diff/${encodeURIComponent(filePath)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return "";
  const data = (await res.json()) as { file: string; diff: string };
  return data.diff;
}

export interface EventData {
  timestamp: string;
  type: string;
  taskId?: string;
  agent?: string;
  message: string;
  relative: string;
}

export async function fetchEvents(name: string): Promise<EventData[]> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/events`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { events: EventData[] };
  return data.events;
}

export type UpdateTaskResult = { ok: true; task: Task } | { ok: false; error: string };

export async function updateTask(
  sessionName: string,
  taskId: string,
  fields: {
    status?: string;
    assignee?: string;
    title?: string;
    description?: string;
    priority?: number;
    override?: boolean;
  },
): Promise<UpdateTaskResult> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(sessionName)}/task/${encodeURIComponent(taskId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    },
  );
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; task: Task }
    | { error: string }
    | null;
  if (!res.ok || !data || !("task" in data)) {
    // Surface the refusal reason (e.g. the review-flow guard) — never a silent no-op.
    return { ok: false, error: data && "error" in data ? data.error : `HTTP ${res.status}` };
  }
  return { ok: true, task: data.task };
}

export interface CreateTaskFields {
  title: string;
  description?: string;
  priority?: number;
  goal?: string;
  tags?: string[];
  assignee?: string;
  specialty?: string;
  milestone?: string;
  fulfills?: string[];
  depends?: string[];
}

export type CreateTaskResult = { ok: true; task: Task } | { ok: false; error: string };

export async function createTask(
  sessionName: string,
  fields: CreateTaskFields,
): Promise<CreateTaskResult> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(sessionName)}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; task: Task }
    | { error: string; unknownAssertions?: string[]; unknownTasks?: string[] }
    | null;
  if (!res.ok || !data || !("task" in data)) {
    // Surface the invariant-guard detail (409) so the modal can name the bad ref.
    const detail = data && "error" in data ? data.error : `HTTP ${res.status}`;
    const extra =
      data && "unknownAssertions" in data && data.unknownAssertions
        ? `: ${data.unknownAssertions.join(", ")}`
        : data && "unknownTasks" in data && data.unknownTasks
          ? `: ${data.unknownTasks.join(", ")}`
          : "";
    return { ok: false, error: `${detail}${extra}` };
  }
  return { ok: true, task: data.task };
}

/**
 * Mission kill-switch. `confirm` must equal the mission title (type-the-name gate,
 * enforced server-side too). On success the daemon bounces — the console will
 * briefly disconnect and auto-reconnect.
 */
export async function stopAndWipeMission(
  name: string,
  confirm: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/mission/wipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  } catch {
    // The daemon may bounce before the response lands — treat a dropped connection
    // as success in flight; the console will reconnect and reflect the wiped state.
    return { ok: true };
  }
}

export async function fetchAssertionIds(name: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/validation/assertions`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { assertions: string[] };
  return data.assertions ?? [];
}

export async function createMilestone(
  name: string,
  fields: { title: string; sequence: number; description?: string },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/milestones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
}

export async function updateMilestone(
  name: string,
  id: string,
  fields: { status?: MilestoneData["status"]; title?: string; description?: string },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/milestones/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    },
  );
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
}

export async function insertMilestone(
  name: string,
  fields: { title: string; description?: string; position: number },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/milestones/insert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
}

export async function fetchContract(name: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/validation/contract`,
  );
  if (!res.ok) return "";
  const data = (await res.json()) as { content: string };
  return data.content ?? "";
}

export async function saveContract(
  name: string,
  content: string,
): Promise<{ ok: boolean; error?: string; stillClaimed?: Record<string, string[]> }> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/validation/contract`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as {
    error?: string;
    stillClaimed?: Record<string, string[]>;
  } | null;
  return {
    ok: false,
    error: data?.error ?? `HTTP ${res.status}`,
    stillClaimed: data?.stillClaimed,
  };
}

export type AssertionStatus = "pending" | "passing" | "failing" | "blocked";

/**
 * Set an assertion's verification status via the daemon's shared assert path
 * (the same write the `validate assert` CLI uses). Evidence is required
 * server-side when marking passing/failing; that rejection surfaces as ok=false.
 */
export async function assertValidation(
  name: string,
  assertionId: string,
  input: { status: AssertionStatus; evidence?: string; verifiedBy?: string },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/validation/assert/${encodeURIComponent(
      assertionId,
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
}

// "unknown" is client-synthesized (never sent by the server): the composer marks a
// still-pending recipient unknown when the batch becomes unreachable (daemon bounce).
export type ReceiptStatus =
  | "retrying"
  | "delivered"
  | "duplicate"
  | "superseded"
  | "failed"
  | "unknown";

export interface SendRecipient {
  paneId: string;
  name: string | null;
  title: string;
  role: string | null;
  status: ReceiptStatus;
  attempts: number;
}

export interface SendBatch {
  batchId: string;
  done: boolean;
  ok: boolean;
  fanOut?: boolean;
  recipients: SendRecipient[];
}

export type SendResult =
  | { ok: true; batch: SendBatch }
  | { ok: false; error: string; available?: { title: string; name: string | null }[] };

/** Kick off a send; returns the batchId + seeded recipients immediately (poll for receipts). */
export async function sendToTargets(
  name: string,
  fields: { target: string; message: string; fireAndForget?: boolean },
  baseUrl: string = API_BASE,
): Promise<SendResult> {
  const res = await fetch(`${baseUrl}/api/project/${encodeURIComponent(name)}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: true; batchId: string; fanOut?: boolean; recipients: SendRecipient[] }
    | { error: string; available?: { title: string; name: string | null }[] }
    | null;
  if (!res.ok || !data || !("batchId" in data)) {
    return {
      ok: false,
      error: data && "error" in data ? data.error : `HTTP ${res.status}`,
      available: data && "available" in data ? data.available : undefined,
    };
  }
  return {
    ok: true,
    batch: {
      batchId: data.batchId,
      done: false,
      ok: true,
      fanOut: data.fanOut,
      recipients: data.recipients,
    },
  };
}

export interface SendPreviewMatch {
  id: string;
  name: string | null;
  title: string;
  role: string | null;
}

/**
 * Preview which panes a send target resolves to (the server reuses
 * resolveSendTargets, so this can never disagree with an actual send).
 * Returns null when the resolution could not run (session missing / network
 * error) — distinct from an empty array, which means "resolved, zero matches".
 */
export async function fetchSendPreview(
  name: string,
  target: string,
  baseUrl: string = API_BASE,
): Promise<SendPreviewMatch[] | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/project/${encodeURIComponent(name)}/send/preview?target=${encodeURIComponent(target)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { matches?: SendPreviewMatch[] } | null;
    return data?.matches ?? null;
  } catch {
    // fetch rejects (not just !ok) when the pod is offline — a supported state
    // for a federated composer. Fail open: null leaves send un-gated.
    return null;
  }
}

export async function fetchSendBatch(
  name: string,
  batchId: string,
  baseUrl: string = API_BASE,
): Promise<SendBatch | null> {
  const res = await fetch(
    `${baseUrl}/api/project/${encodeURIComponent(name)}/send/batch/${encodeURIComponent(batchId)}`,
  );
  if (!res.ok) return null;
  return (await res.json()) as SendBatch;
}

export type PlanStatus = "pending" | "in-progress" | "done" | "archived";

export interface PlanSummary {
  name: string;
  path: string;
  title: string;
  status: PlanStatus;
  effort: string | null;
  completed: string | null;
}

export async function fetchPlans(name: string): Promise<PlanSummary[]> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/plans`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { plans: PlanSummary[] };
  return data.plans;
}

export async function markPlanDone(name: string, filename: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/plans/${encodeURIComponent(filename)}/done`,
    { method: "POST" },
  );
  return res.ok;
}

export interface AuthorshipSection {
  author: string;
  at: string;
  charCount: number;
}

export interface AuthorshipData {
  sections: Record<string, AuthorshipSection>;
  stats: { aiPercent: number; humanPercent: number; totalChars: number };
}

export interface PlanData {
  content: string;
  authorship: AuthorshipData | null;
}

/**
 * Convert character-range marks into section-level authorship summaries.
 * Each section heading in the markdown gets attributed to the author
 * who wrote the most characters in that section.
 */
export function marksToSections(
  marks: Record<string, Mark>,
  content: string,
): Record<string, AuthorshipSection> {
  // Find section boundaries from heading lines
  const lines = content.split("\n");
  const sections: { heading: string; from: number; to: number }[] = [];
  let offset = 0;
  let currentHeading = "";
  let sectionStart = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading || offset > 0) {
        sections.push({ heading: currentHeading, from: sectionStart, to: offset });
      }
      currentHeading = headingMatch[1]!.trim();
      sectionStart = offset;
    }
    offset += line.length + 1; // +1 for newline
  }
  sections.push({ heading: currentHeading, from: sectionStart, to: offset });

  // For each section, find the dominant author from overlapping marks
  const result: Record<string, AuthorshipSection> = {};
  const markList = Object.values(marks).filter((m) => !m.orphaned);

  for (const section of sections) {
    if (!section.heading) continue;
    const authorChars: Record<string, { chars: number; latestAt: string }> = {};

    for (const mark of markList) {
      const overlapFrom = Math.max(mark.range.from, section.from);
      const overlapTo = Math.min(mark.range.to, section.to);
      if (overlapFrom >= overlapTo) continue;

      const chars = overlapTo - overlapFrom;
      const existing = authorChars[mark.by];
      if (existing) {
        existing.chars += chars;
        if (mark.at > existing.latestAt) existing.latestAt = mark.at;
      } else {
        authorChars[mark.by] = { chars, latestAt: mark.at };
      }
    }

    // Pick the author with the most characters in this section
    let dominant: { author: string; chars: number; at: string } | null = null;
    for (const [author, data] of Object.entries(authorChars)) {
      if (!dominant || data.chars > dominant.chars) {
        dominant = { author, chars: data.chars, at: data.latestAt };
      }
    }

    if (dominant) {
      result[section.heading] = {
        author: dominant.author,
        at: dominant.at,
        charCount: dominant.chars,
      };
    }
  }

  return result;
}

export async function fetchPlan(name: string, filename: string): Promise<PlanData> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/plans/${encodeURIComponent(filename)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return { content: "", authorship: null };
  const data = (await res.json()) as {
    name: string;
    content: string;
    marks: Record<string, Mark> | null;
    stats: AuthorshipStats | null;
  };

  let authorship: AuthorshipData | null = null;
  if (data.marks && data.stats) {
    authorship = {
      sections: marksToSections(data.marks, data.content),
      stats: data.stats,
    };
  }

  return { content: data.content, authorship };
}

// --- Milestones ---

export interface MilestoneData {
  id: string;
  title: string;
  description: string;
  status: "locked" | "active" | "done" | "validating";
  order: number;
  taskCount: number;
  tasksDone: number;
}

export async function fetchMilestones(name: string): Promise<MilestoneData[]> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/milestones`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { milestones: MilestoneData[] };
  return data.milestones;
}

// --- Validation ---

export interface ValidationData {
  contract: string | null;
  state: {
    assertions: Record<
      string,
      { status: AssertionStatus; verifiedBy: string | null; evidence: string | null }
    >;
    lastVerified: string | null;
  } | null;
}

export interface CoverageData {
  unclaimed: string[];
  duplicates: Record<string, string[]>;
}

export async function fetchValidation(name: string): Promise<ValidationData | null> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/validation`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as ValidationData;
}

export async function fetchCoverage(name: string): Promise<CoverageData | null> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/validation/coverage`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as CoverageData;
}

// --- Mission ---

export interface MissionDetail {
  mission: {
    title: string;
    description: string;
    status: string;
    branch: string | null;
    milestones: MilestoneData[];
  };
  validationSummary: {
    total: number;
    passing: number;
    failing: number;
    pending: number;
    blocked: number;
  };
}

export async function fetchMission(name: string): Promise<MissionDetail | null> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/mission`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as MissionDetail;
}

// --- Metrics ---

export interface AgentMetricsData {
  name: string;
  totalTimeMs: number;
  activeTimeMs: number;
  idleTimeMs: number;
  taskCount: number;
  retryCount: number;
  utilization: number;
  specialties: string[];
}

export interface MilestoneMetricsData {
  id: string;
  title: string;
  status: string;
  taskCount: number;
  completedCount: number;
  durationMs: number;
}

export interface TimelineEntryData {
  timestamp: string;
  completedTasks: number;
  activeTasks: number;
  busyAgents: number;
  idleAgents: number;
}

export interface MetricsData {
  session: { startedAt: string | null; durationMs: number; status: string; agentCount: number };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    retried: number;
    completionRate: number;
    retryRate: number;
    avgDurationMs: number;
    medianDurationMs: number;
    p90DurationMs: number;
    byMilestone: MilestoneMetricsData[];
  };
  agents: AgentMetricsData[];
  mission: {
    title: string | null;
    status: string | null;
    milestonesCompleted: number;
    validationPassRate: number;
    wallClockMs: number;
  };
  timeline: TimelineEntryData[];
}

export async function fetchMetrics(name: string): Promise<MetricsData | null> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/metrics`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as MetricsData;
}

export async function deleteTaskApi(sessionName: string, taskId: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(sessionName)}/task/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  return res.ok;
}

export async function savePlan(name: string, filename: string, content: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/plans/${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  return res.ok;
}

export type CreatePlanResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Create a new (stub) plan file. Server enforces kebab-case (400) and rejects a
 * name collision (409); the returned error surfaces those to the user.
 */
export async function createPlan(name: string, planName: string): Promise<CreatePlanResult> {
  const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(name)}/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: planName }),
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    path?: string;
    error?: string;
  } | null;
  if (!res.ok || !data?.ok || !data.path) {
    return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  }
  return { ok: true, path: data.path };
}

export async function deletePlan(name: string, filename: string): Promise<boolean> {
  const res = await fetch(
    `${API_BASE}/api/project/${encodeURIComponent(name)}/plans/${encodeURIComponent(filename)}`,
    { method: "DELETE" },
  );
  return res.ok;
}
