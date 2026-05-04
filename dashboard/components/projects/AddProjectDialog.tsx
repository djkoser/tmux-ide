"use client";

import { CheckCircle2, FolderPlus, GitBranch, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  fetchProjectTemplates,
  initProject,
  probeProject,
  registerProject,
  type ProjectTemplate,
  type RegisteredProject,
} from "@/lib/api";
import {
  closeAddProjectDialog,
  setAddProjectDialogOpen,
  useAddProjectDialog,
  type AddProjectTab,
} from "@/lib/addProjectDialogStore";
import { setNavigation } from "@/lib/navigation";
import { useProjects, refreshProjects } from "@/lib/projectStore";
import { useSettings } from "@/lib/useSettings";
import { useToasts } from "@/lib/useToasts";
import { subscribeGlobal, type ServerFrame } from "@/lib/wsBus";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import {
  chunksToConsoleText,
  deriveInitTabSubmit,
  deriveNameFromDir,
  deriveOpenTabSubmit,
  initJobReducer,
  isInitDoneFrame,
  isInitErrorFrame,
  normalizeDir,
  parseInitOutputFrame,
  validateDir,
  validateName,
  type InitJobState,
} from "./AddProjectDialog.logic";

/**
 * Three-tab dialog for adding a project to the registry.
 *
 *   - "open"  — point at an existing tmux-ide directory and register it.
 *   - "init"  — pick a directory + template, server runs `tmux-ide init`.
 *   - "clone" — coming soon (server-side support gated by Agent 1).
 *
 * Rendering only — all validators, the init job state machine, and the
 * frame parsers live in `AddProjectDialog.logic.ts`. The store / WS / fetch
 * wiring is in this file because that's the only React concern.
 */
export function AddProjectDialog() {
  const { open, initialTab } = useAddProjectDialog();
  const [tab, setTab] = useState<AddProjectTab>(initialTab);

  // Reset internal tab when the singleton open transitions false -> true.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Dialog open={open} onOpenChange={setAddProjectDialogOpen}>
      <DialogContent
        data-testid="add-project-dialog"
        className="w-[min(640px,calc(100vw-32px))] p-5"
      >
        <DialogHeader>
          <DialogTitle>Add a project</DialogTitle>
          <DialogDescription>
            Open an existing tmux-ide project or initialize a new one in a directory.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex border-b border-[var(--border-weak)]">
          <TabButton
            active={tab === "open"}
            onClick={() => setTab("open")}
            icon={<FolderPlus aria-hidden="true" size={13} />}
            label="Open existing"
            testId="add-project-tab-open"
          />
          <TabButton
            active={tab === "init"}
            onClick={() => setTab("init")}
            icon={<Sparkles aria-hidden="true" size={13} />}
            label="Initialize"
            testId="add-project-tab-init"
          />
          <TabButton
            active={tab === "clone"}
            onClick={() => setTab("clone")}
            icon={<GitBranch aria-hidden="true" size={13} />}
            label="Clone from Git"
            testId="add-project-tab-clone"
          />
        </div>

        <div className="mt-4">
          {tab === "open" && <OpenExistingTab />}
          {tab === "init" && <InitializeTab />}
          {tab === "clone" && <CloneTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  testId: string;
}

function TabButton({ active, onClick, icon, label, testId }: TabButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-colors ${
        active
          ? "border-[var(--accent)] text-[var(--fg)]"
          : "border-transparent text-[var(--dim)] hover:text-[var(--fg)]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ---------- Open existing ----------

function OpenExistingTab() {
  const settings = useSettings();
  const { projects } = useProjects();
  const { push } = useToasts();
  const baseDir = settings.general.addProjectBaseDirectory ?? "~/";
  const [rawDir, setRawDir] = useState(baseDir);
  const [probing, setProbing] = useState(false);
  const [probed, setProbed] = useState<RegisteredProject | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dir = normalizeDir(rawDir, baseDir);
  const dirValidation = validateDir(rawDir);

  const onProbe = useCallback(async () => {
    if (!dirValidation.valid) return;
    setProbing(true);
    setProbeError(null);
    try {
      const project = await probeProject(dir);
      setProbed(project);
    } catch (error) {
      setProbed(null);
      setProbeError(error instanceof Error ? error.message : "Probe failed");
    } finally {
      setProbing(false);
    }
  }, [dir, dirValidation.valid]);

  const onSubmit = useCallback(async () => {
    if (!probed) return;
    setSubmitting(true);
    try {
      const project = await registerProject(probed.dir, probed.name);
      void refreshProjects();
      push({
        kind: "success",
        title: "Project added",
        body: project.name,
      });
      closeAddProjectDialog();
      setNavigation({ type: "sessions", sessionName: project.name });
    } catch (error) {
      push({
        kind: "error",
        title: "Failed to add project",
        body: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [probed, push]);

  const submitState = deriveOpenTabSubmit({
    dir,
    probed,
    probing,
    existing: projects,
  });

  return (
    <div className="space-y-3">
      <DirInput
        value={rawDir}
        onChange={(next) => {
          setRawDir(next);
          setProbed(null);
          setProbeError(null);
        }}
        onBlur={onProbe}
        onEnter={onProbe}
        placeholder={baseDir}
        validation={dirValidation}
      />

      {probeError && (
        <Banner tone="error" testId="add-project-probe-error">
          {probeError}
        </Banner>
      )}

      {probed && !probed.hasIdeYml && (
        <Banner tone="warn">
          No <code>ide.yml</code> in this directory. Switch to{" "}
          <strong>Initialize</strong> to create one.
        </Banner>
      )}

      {probed && probed.hasIdeYml && (
        <ProjectPreview project={probed} />
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={closeAddProjectDialog}>
          Cancel
        </Button>
        <Button
          data-testid="add-project-submit"
          onClick={onSubmit}
          isPending={submitting}
          disabled={!submitState.canSubmit || submitting}
          title={submitState.reason ?? undefined}
        >
          Add project
        </Button>
      </div>
    </div>
  );
}

// ---------- Initialize ----------

function InitializeTab() {
  const settings = useSettings();
  const { projects } = useProjects();
  const { push } = useToasts();
  const baseDir = settings.general.addProjectBaseDirectory ?? "~/";
  const [rawDir, setRawDir] = useState(baseDir);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [template, setTemplate] = useState<string>("");
  const [job, dispatch] = useReducer(initJobReducer, { kind: "idle" } as InitJobState);
  const [starting, setStarting] = useState(false);
  const consoleRef = useRef<HTMLPreElement | null>(null);

  const dir = normalizeDir(rawDir, baseDir);
  const dirValidation = validateDir(rawDir);

  const derivedName = useMemo(() => deriveNameFromDir(dir), [dir]);
  const nameValidation = useMemo(
    () => validateName(derivedName, projects),
    [derivedName, projects],
  );

  // Load templates once.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await fetchProjectTemplates();
        if (!active) return;
        setTemplates(data);
      } finally {
        if (active) setTemplatesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Subscribe to WS frames while a job is running so we can pipe
  // init.output into the reducer and detect init.error.
  useEffect(() => {
    if (job.kind !== "running") return;
    const expectedJobId = job.jobId;
    const release = subscribeGlobal((frame: ServerFrame) => {
      const chunk = parseInitOutputFrame(frame, expectedJobId);
      if (chunk) {
        dispatch({ type: "chunk", jobId: expectedJobId, chunk });
      }
      if (isInitDoneFrame(frame, expectedJobId)) {
        // Server pushes a `projects.changed` frame too; the project store
        // refetches and we can then look up the newly-registered project.
        void refreshProjects().then(() => {
          // We don't get the project on the frame itself; rely on the
          // refreshed list to find it. Best-effort: the success state
          // can still be reached without a project reference.
          dispatch({ type: "succeeded", jobId: expectedJobId, project: null });
        });
      }
      const errorFrame = isInitErrorFrame(frame, expectedJobId);
      if (errorFrame) {
        dispatch({ type: "failed", jobId: expectedJobId, message: errorFrame.message });
      }
    });
    return () => release();
  }, [job]);

  // Auto-scroll the console.
  useEffect(() => {
    const node = consoleRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [job]);

  const onSubmit = useCallback(async () => {
    if (!dirValidation.valid) return;
    setStarting(true);
    try {
      const { jobId } = await initProject(dir, template || undefined);
      dispatch({ type: "start", jobId });
    } catch (error) {
      push({
        kind: "error",
        title: "Failed to start init",
        body: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setStarting(false);
    }
  }, [dir, dirValidation.valid, push, template]);

  const submitState = deriveInitTabSubmit({ dir, template: template || null, job });

  const consoleText = chunksToConsoleText(
    job.kind === "running" || job.kind === "succeeded" || job.kind === "failed"
      ? job.chunks
      : [],
  );

  return (
    <div className="space-y-3">
      <DirInput
        value={rawDir}
        onChange={setRawDir}
        placeholder={baseDir}
        validation={dirValidation}
        disabled={job.kind === "running" || job.kind === "succeeded"}
      />

      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Template
        </span>
        <select
          data-testid="add-project-template-select"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          disabled={
            templatesLoading || job.kind === "running" || job.kind === "succeeded"
          }
          className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 text-[12px] text-[var(--fg)] outline-none focus-visible:focus-ring disabled:opacity-50"
        >
          <option value="">{templatesLoading ? "Loading…" : "Auto-detect"}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {template && (
          <span className="mt-1 block text-[11px] text-[var(--dim)]">
            {templates.find((t) => t.id === template)?.description ?? ""}
          </span>
        )}
      </label>

      {derivedName && !nameValidation.valid && (
        <Banner tone="warn">{nameValidation.reason}</Banner>
      )}

      {(job.kind === "running" ||
        job.kind === "succeeded" ||
        job.kind === "failed") && (
        <pre
          ref={consoleRef}
          data-testid="add-project-output"
          className="max-h-[220px] overflow-auto rounded-md border border-[var(--border-weak)] bg-[var(--bg)] p-3 font-mono text-[11px] leading-5 text-[var(--fg)]"
        >
          {consoleText || "Starting…\n"}
        </pre>
      )}

      {job.kind === "succeeded" && (
        <SuccessPanel jobId={job.jobId} />
      )}

      {job.kind === "failed" && <Banner tone="error">{job.message}</Banner>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={closeAddProjectDialog}>
          {job.kind === "succeeded" ? "Close" : "Cancel"}
        </Button>
        {job.kind !== "succeeded" && (
          <Button
            data-testid="add-project-submit"
            onClick={onSubmit}
            isPending={starting || job.kind === "running"}
            disabled={!submitState.canSubmit || starting}
            title={submitState.reason ?? undefined}
          >
            Initialize
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Clone (coming soon) ----------

// TODO: Wire to server-side `/api/projects/clone` once Agent 1 ships it.
function CloneTab() {
  return (
    <div className="space-y-3">
      <Banner tone="info">
        Cloning straight from Git is coming soon. For now, clone the repo
        manually and use the <strong>Open existing</strong> tab.
      </Banner>
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
          Git URL
        </span>
        <input
          disabled
          placeholder="git@github.com:owner/repo.git"
          className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none disabled:opacity-50"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={closeAddProjectDialog}>
          Cancel
        </Button>
        <Button data-testid="add-project-submit" disabled>
          Clone
        </Button>
      </div>
    </div>
  );
}

// ---------- Shared bits ----------

interface DirInputProps {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  placeholder?: string;
  validation: { valid: boolean; reason: string | null };
  disabled?: boolean;
}

function DirInput({
  value,
  onChange,
  onBlur,
  onEnter,
  placeholder,
  validation,
  disabled,
}: DirInputProps) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
        Directory
      </span>
      <input
        data-testid="add-project-dir-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter?.();
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
        autoCapitalize="off"
        autoCorrect="off"
        className="mt-1 w-full rounded-md border border-[var(--border-weak)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus-visible:focus-ring disabled:opacity-50"
      />
      {!validation.valid && validation.reason && (
        <span className="mt-1 block text-[11px] text-[var(--red)]">{validation.reason}</span>
      )}
    </label>
  );
}

interface BannerProps {
  tone: "info" | "warn" | "error";
  testId?: string;
  children: React.ReactNode;
}

function Banner({ tone, testId, children }: BannerProps) {
  const color =
    tone === "error"
      ? "border-[var(--red)] text-[var(--red)]"
      : tone === "warn"
        ? "border-[var(--yellow)] text-[var(--yellow)]"
        : "border-[var(--border-weak)] text-[var(--fg)]";
  return (
    <div
      data-testid={testId}
      className={`rounded-md border bg-[var(--surface)] px-3 py-2 text-[11px] leading-5 ${color}`}
    >
      {children}
    </div>
  );
}

function ProjectPreview({ project }: { project: RegisteredProject }) {
  return (
    <div className="rounded-md border border-[var(--border-weak)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--fg)]">
      <div className="flex items-center gap-2">
        <CheckCircle2
          aria-hidden="true"
          size={14}
          className="text-[var(--green)]"
        />
        <span className="font-medium">{project.name}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[80px_1fr] gap-y-1 text-[var(--dim)]">
        <dt>Path</dt>
        <dd className="truncate font-mono text-[var(--fg)]">{project.dir}</dd>
        {project.gitOrigin && (
          <>
            <dt>Origin</dt>
            <dd className="truncate font-mono text-[var(--fg)]">{project.gitOrigin}</dd>
          </>
        )}
        {project.gitBranch && (
          <>
            <dt>Branch</dt>
            <dd className="truncate font-mono text-[var(--fg)]">{project.gitBranch}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function SuccessPanel({ jobId }: { jobId: string }) {
  return (
    <div
      data-testid="add-project-success"
      className="rounded-md border border-[var(--green)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--green)]"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 aria-hidden="true" size={14} />
        <span>Project added! (job {jobId})</span>
      </div>
    </div>
  );
}
