"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useReducer } from "react";
import Card from "@/components/tui/Card";
import Button from "@/components/tui/Button";
import ButtonGroup from "@/components/tui/ButtonGroup";
import Input from "@/components/tui/Input";
import RowSpaceBetween from "@/components/tui/RowSpaceBetween";
import { dispatch } from "@/lib/actionClient";
import {
  inspectDirectory,
  onboardProject,
  type ProjectInspect,
  type ProjectInspectDetected,
} from "@/lib/api";

type StepId = "detect" | "layout" | "naming" | "review";

interface LayoutOption {
  id: "dual-claude" | "triple-claude" | "single-claude";
  label: string;
  description: string;
  agents: number;
  diagram: string[];
}

const LAYOUTS: LayoutOption[] = [
  {
    id: "dual-claude",
    label: "Dual Claude",
    description: "Two Claude panes on top; dev server + shell below.",
    agents: 2,
    diagram: [
      "┌─────────────────┬─────────────────┐",
      "│    Claude 1     │    Claude 2     │  70%",
      "├─────────────────┼─────────────────┤",
      "│   Dev Server    │     Shell       │  30%",
      "└─────────────────┴─────────────────┘",
    ],
  },
  {
    id: "triple-claude",
    label: "Triple Claude",
    description: "Three Claude panes on top; dev server + shell below.",
    agents: 3,
    diagram: [
      "┌──────────┬──────────┬──────────┐",
      "│ Claude 1 │ Claude 2 │ Claude 3 │  70%",
      "├──────────┴────┬─────┴──────────┤",
      "│  Dev Server   │     Shell      │  30%",
      "└───────────────┴────────────────┘",
    ],
  },
  {
    id: "single-claude",
    label: "Single Claude",
    description: "One wide Claude pane; dev server, tests, shell below.",
    agents: 1,
    diagram: [
      "┌─────────────────────────────────┐",
      "│           Claude                │  60%",
      "├─────────┬─────────┬─────────────┤",
      "│ Dev Srv │  Tests  │    Shell    │  40%",
      "└─────────┴─────────┴─────────────┘",
    ],
  },
];

const STEPS: { id: StepId; label: string }[] = [
  { id: "detect", label: "1. Detect" },
  { id: "layout", label: "2. Layout" },
  { id: "naming", label: "3. Agents" },
  { id: "review", label: "4. Review" },
];

interface SetupState {
  step: StepId;
  dir: string;
  inspect: ProjectInspect | null;
  inspectError: string | null;
  inspectLoading: boolean;
  layoutId: LayoutOption["id"];
  projectName: string;
  projectNameTouched: boolean;
  agentNames: string[];
  saving: boolean;
  saveError: string | null;
  savedName: string | null;
  launching: boolean;
  launchError: string | null;
}

type Action =
  | { type: "set-step"; step: StepId }
  | { type: "set-dir"; dir: string }
  | { type: "inspect-start" }
  | { type: "inspect-success"; inspect: ProjectInspect }
  | { type: "inspect-error"; error: string }
  | { type: "set-layout"; layoutId: LayoutOption["id"] }
  | { type: "set-project-name"; name: string }
  | { type: "set-agent-name"; index: number; name: string }
  | { type: "save-start" }
  | { type: "save-success"; name: string }
  | { type: "save-error"; error: string }
  | { type: "launch-start" }
  | { type: "launch-success" }
  | { type: "launch-error"; error: string };

function defaultAgentNames(layoutId: LayoutOption["id"]): string[] {
  const layout = LAYOUTS.find((l) => l.id === layoutId)!;
  if (layout.agents === 1) return ["Claude"];
  return Array.from({ length: layout.agents }, (_, i) => `Claude ${i + 1}`);
}

const INITIAL_STATE: SetupState = {
  step: "detect",
  dir: "",
  inspect: null,
  inspectError: null,
  inspectLoading: false,
  layoutId: "dual-claude",
  projectName: "",
  projectNameTouched: false,
  agentNames: defaultAgentNames("dual-claude"),
  saving: false,
  saveError: null,
  savedName: null,
  launching: false,
  launchError: null,
};

function reducer(state: SetupState, action: Action): SetupState {
  switch (action.type) {
    case "set-step":
      return { ...state, step: action.step };
    case "set-dir":
      return { ...state, dir: action.dir, inspectError: null };
    case "inspect-start":
      return { ...state, inspectLoading: true, inspectError: null };
    case "inspect-success":
      return {
        ...state,
        inspectLoading: false,
        inspect: action.inspect,
        projectName: state.projectNameTouched ? state.projectName : action.inspect.name,
      };
    case "inspect-error":
      return { ...state, inspectLoading: false, inspectError: action.error };
    case "set-layout":
      return {
        ...state,
        layoutId: action.layoutId,
        agentNames: defaultAgentNames(action.layoutId),
      };
    case "set-project-name":
      return { ...state, projectName: action.name, projectNameTouched: true };
    case "set-agent-name": {
      const next = [...state.agentNames];
      next[action.index] = action.name;
      return { ...state, agentNames: next };
    }
    case "save-start":
      return { ...state, saving: true, saveError: null };
    case "save-success":
      return { ...state, saving: false, savedName: action.name };
    case "save-error":
      return { ...state, saving: false, saveError: action.error };
    case "launch-start":
      return { ...state, launching: true, launchError: null };
    case "launch-success":
      return { ...state, launching: false };
    case "launch-error":
      return { ...state, launching: false, launchError: action.error };
    default:
      return state;
  }
}

export default function V2SetupPage() {
  const router = useRouter();
  const [state, dispatchAction] = useReducer(reducer, INITIAL_STATE);

  function gotoStep(step: StepId) {
    dispatchAction({ type: "set-step", step });
  }

  async function handleDetect() {
    if (!state.dir.trim()) return;
    dispatchAction({ type: "inspect-start" });
    try {
      const inspect = await inspectDirectory(state.dir.trim());
      dispatchAction({ type: "inspect-success", inspect });
    } catch (err) {
      dispatchAction({
        type: "inspect-error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleSaveAndLaunch() {
    if (!state.inspect) return;
    const layout = LAYOUTS.find((l) => l.id === state.layoutId)!;
    dispatchAction({ type: "save-start" });
    try {
      const project = await onboardProject({
        dir: state.inspect.dir,
        name: state.projectName.trim() || state.inspect.name,
        agents: layout.agents,
        agentNames: state.agentNames.map((n) => n.trim()).filter(Boolean),
        devCommand: state.inspect.detected.devCommand,
        testCommand: state.inspect.detected.testCommand,
      });
      dispatchAction({ type: "save-success", name: project.name });

      dispatchAction({ type: "launch-start" });
      try {
        await dispatch("project.launch", { name: project.name });
        dispatchAction({ type: "launch-success" });
        router.push(`/v2/project/${encodeURIComponent(project.name)}`);
      } catch (err) {
        dispatchAction({
          type: "launch-error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } catch (err) {
      dispatchAction({
        type: "save-error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const currentLayout = LAYOUTS.find((l) => l.id === state.layoutId)!;
  const stepIndex = STEPS.findIndex((s) => s.id === state.step);
  const canAdvance = computeCanAdvance(state);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-strong)] px-3 text-[11px] tabular-nums">
        <Link
          href="/v2"
          className="mr-2 inline-flex items-center gap-1 text-[var(--dim)] hover:text-[var(--fg)]"
        >
          <span aria-hidden="true">◇</span>
          <span>tmux-ide</span>
        </Link>
        <span className="mx-1 text-[var(--dimmer)]">/</span>
        <span className="text-[var(--accent)]">setup</span>
        <span className="flex-1" />
        <span className="text-[var(--dim)]">
          step {stepIndex + 1} of {STEPS.length}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-3">
          <ButtonGroup
            items={STEPS.map((s, i) => ({
              body: s.label,
              selected: s.id === state.step,
              onClick: () => {
                if (i <= stepIndex || canStepDirectly(state, s.id)) gotoStep(s.id);
              },
            }))}
          />

          {state.step === "detect" && (
            <DetectPanel
              state={state}
              onDir={(dir) => dispatchAction({ type: "set-dir", dir })}
              onDetect={handleDetect}
            />
          )}
          {state.step === "layout" && (
            <LayoutPanel
              currentId={state.layoutId}
              onSelect={(id) => dispatchAction({ type: "set-layout", layoutId: id })}
            />
          )}
          {state.step === "naming" && (
            <NamingPanel
              projectName={state.projectName}
              agentNames={state.agentNames}
              onProjectName={(name) => dispatchAction({ type: "set-project-name", name })}
              onAgentName={(index, name) => dispatchAction({ type: "set-agent-name", index, name })}
            />
          )}
          {state.step === "review" && (
            <ReviewPanel state={state} layout={currentLayout} onSubmit={handleSaveAndLaunch} />
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2">
        <Button
          theme="SECONDARY"
          onClick={() => {
            const prev = STEPS[stepIndex - 1];
            if (prev) gotoStep(prev.id);
          }}
          disabled={stepIndex === 0}
        >
          Back
        </Button>
        <span className="flex-1" />
        {state.step !== "review" ? (
          <Button
            onClick={() => {
              const next = STEPS[stepIndex + 1];
              if (next && canAdvance) gotoStep(next.id);
            }}
            disabled={!canAdvance}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSaveAndLaunch}
            disabled={state.saving || state.launching || !!state.savedName}
          >
            {state.saving
              ? "Saving..."
              : state.launching
                ? "Launching..."
                : state.savedName
                  ? "Done"
                  : "Save & Launch"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function computeCanAdvance(state: SetupState): boolean {
  switch (state.step) {
    case "detect":
      return state.inspect !== null;
    case "layout":
      return true;
    case "naming":
      return (
        state.projectName.trim().length > 0 && state.agentNames.every((n) => n.trim().length > 0)
      );
    case "review":
      return false;
    default:
      return false;
  }
}

function canStepDirectly(state: SetupState, target: StepId): boolean {
  // Allow forward jump only if all preceding gates are satisfied.
  const order = STEPS.map((s) => s.id);
  const idx = order.indexOf(target);
  for (let i = 0; i < idx; i += 1) {
    const sId = order[i];
    if (sId === "detect" && state.inspect === null) return false;
    if (
      sId === "naming" &&
      (state.projectName.trim().length === 0 || state.agentNames.some((n) => !n.trim()))
    ) {
      return false;
    }
  }
  return true;
}

interface DetectPanelProps {
  state: SetupState;
  onDir: (dir: string) => void;
  onDetect: () => void;
}

function DetectPanel({ state, onDir, onDetect }: DetectPanelProps) {
  return (
    <Card title="DETECT PROJECT" mode="left">
      <p className="mb-3 text-[var(--dim)]">
        Point the wizard at a directory. The daemon inspects it and reports the package manager,
        frameworks, and detected dev/test commands.
      </p>
      <Input
        label="Directory"
        placeholder="/Users/me/Developer/my-project"
        value={state.dir}
        onChange={(e) => onDir(e.currentTarget.value)}
      />
      <RowSpaceBetween>
        <span className="text-[11px] text-[var(--dim)]">
          {state.inspectLoading ? "Inspecting..." : state.inspectError ? "" : ""}
        </span>
        <Button onClick={onDetect} disabled={!state.dir.trim() || state.inspectLoading}>
          {state.inspectLoading ? "..." : "Inspect"}
        </Button>
      </RowSpaceBetween>

      {state.inspectError && <p className="mt-2 text-[var(--red)]">{state.inspectError}</p>}

      {state.inspect && (
        <DetectSummary detected={state.inspect.detected} hasIdeYml={state.inspect.hasIdeYml} />
      )}
    </Card>
  );
}

function DetectSummary({
  detected,
  hasIdeYml,
}: {
  detected: ProjectInspectDetected;
  hasIdeYml: boolean;
}) {
  return (
    <div className="mt-3 space-y-1 text-[12px]">
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Package manager</span>
        <span>{detected.packageManager ?? "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Frameworks</span>
        <span>{detected.frameworks.length > 0 ? detected.frameworks.join(", ") : "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Dev command</span>
        <span>{detected.devCommand ?? "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Test command</span>
        <span>{detected.testCommand ?? "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Existing ide.yml</span>
        <span>{hasIdeYml ? "yes (will be replaced)" : "no"}</span>
      </RowSpaceBetween>
    </div>
  );
}

interface LayoutPanelProps {
  currentId: LayoutOption["id"];
  onSelect: (id: LayoutOption["id"]) => void;
}

function LayoutPanel({ currentId, onSelect }: LayoutPanelProps) {
  return (
    <Card title="PICK LAYOUT" mode="left">
      <p className="mb-3 text-[var(--dim)]">
        Choose the pane arrangement. You can edit ide.yml later.
      </p>
      <div className="space-y-2">
        {LAYOUTS.map((layout) => {
          const selected = layout.id === currentId;
          return (
            <button
              key={layout.id}
              type="button"
              onClick={() => onSelect(layout.id)}
              data-selected={selected ? "true" : "false"}
              className={`block w-full border px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-[var(--accent)] bg-[var(--surface-active)]"
                  : "border-[var(--border-weak)] bg-[var(--bg-strong)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <RowSpaceBetween>
                <span className="font-medium text-[var(--fg)]">{layout.label}</span>
                <span className="text-[11px] text-[var(--dim)]">{layout.agents} agents</span>
              </RowSpaceBetween>
              <p className="mt-1 text-[11px] text-[var(--dim)]">{layout.description}</p>
              <pre className="mt-2 overflow-x-auto text-[10px] leading-tight text-[var(--fg-secondary)]">
                {layout.diagram.join("\n")}
              </pre>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

interface NamingPanelProps {
  projectName: string;
  agentNames: string[];
  onProjectName: (name: string) => void;
  onAgentName: (index: number, name: string) => void;
}

function NamingPanel({ projectName, agentNames, onProjectName, onAgentName }: NamingPanelProps) {
  return (
    <Card title="NAME AGENTS" mode="left">
      <p className="mb-3 text-[var(--dim)]">Pick a session name and per-agent pane titles.</p>
      <Input
        label="Session name"
        placeholder="my-project"
        value={projectName}
        onChange={(e) => onProjectName(e.currentTarget.value)}
      />
      <div className="mt-3 space-y-2">
        {agentNames.map((name, i) => (
          <Input
            key={i}
            label={`Agent ${i + 1}`}
            value={name}
            onChange={(e) => onAgentName(i, e.currentTarget.value)}
          />
        ))}
      </div>
    </Card>
  );
}

interface ReviewPanelProps {
  state: SetupState;
  layout: LayoutOption;
  onSubmit: () => void;
}

function ReviewPanel({ state, layout, onSubmit }: ReviewPanelProps) {
  useEffect(() => {
    // No auto-submit; user clicks the footer button. Hook reserved for future
    // submit-on-mount UX.
  }, []);

  void onSubmit;

  return (
    <Card title="REVIEW" mode="left">
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Directory</span>
        <span className="truncate">{state.inspect?.dir ?? "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Session name</span>
        <span>{state.projectName.trim() || state.inspect?.name || "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Layout</span>
        <span>{layout.label}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Agents</span>
        <span>{state.agentNames.join(", ")}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Dev command</span>
        <span>{state.inspect?.detected.devCommand ?? "—"}</span>
      </RowSpaceBetween>
      <RowSpaceBetween>
        <span className="text-[var(--dim)]">Test command</span>
        <span>{state.inspect?.detected.testCommand ?? "—"}</span>
      </RowSpaceBetween>

      {state.saveError && <p className="mt-3 text-[var(--red)]">Save failed: {state.saveError}</p>}
      {state.launchError && (
        <p className="mt-3 text-[var(--red)]">Launch failed: {state.launchError}</p>
      )}
      {state.savedName && !state.launchError && (
        <p className="mt-3 text-[var(--green)]">Saved {state.savedName}. Launching session…</p>
      )}
    </Card>
  );
}
