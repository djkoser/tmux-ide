/**
 * The team TUI — a cockpit over every tmux session.
 *
 * A two-level PROJECT view: every registered project is listed (including
 * ones with no running session = "stopped"), with its live tmux sessions
 * nested underneath. Unregistered live sessions surface as ad-hoc project
 * rows so nothing is hidden. Runs under bun (JSX via the @opentui/solid
 * preload) and is spawned by `tmux-ide team`.
 */
import { execFileSync } from "node:child_process";
import { render, useKeyboard } from "@opentui/solid";
import { RGBA, TextAttributes } from "@opentui/core";
import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { createDetachedSession, killSession } from "@tmux-ide/tmux-bridge";
import { createTheme } from "../../widgets/lib/theme.ts";
import { type TeamSession } from "./sessions.ts";
import { listTeamProjects, type TeamProject } from "./projects.ts";
import { registerProject, unregisterProject } from "../../lib/project-registry.ts";
import { createStatusTracker, type AgentStatus } from "../detect/classify.ts";
import { nextInput } from "./input.ts";

function toRGBA(c: { r: number; g: number; b: number; a: number }): RGBA {
  return RGBA.fromInts(c.r, c.g, c.b, c.a);
}

const STATUS: Record<AgentStatus, { glyph: string; label: string }> = {
  blocked: { glyph: "●", label: "blocked" },
  working: { glyph: "●", label: "working" },
  done: { glyph: "●", label: "done" },
  idle: { glyph: "●", label: "idle" },
  unknown: { glyph: "·", label: "unknown" },
};

/** A flattened navigable row — a project header or one of its sessions. */
type Row =
  | { kind: "project"; project: TeamProject }
  | { kind: "session"; project: TeamProject; session: TeamSession };

/** Flatten the project tree into the navigable row list. */
function toRows(projects: TeamProject[]): Row[] {
  const rows: Row[] = [];
  for (const project of projects) {
    rows.push({ kind: "project", project });
    for (const session of project.sessions) {
      rows.push({ kind: "session", project, session });
    }
  }
  return rows;
}

render(() => {
  const theme = createTheme();
  // One tracker persists across refreshes so the cross-tick `done` state
  // (working→idle without being viewed) can be inferred.
  const tracker = createStatusTracker();
  const statusColor: Record<AgentStatus, RGBA> = {
    blocked: RGBA.fromInts(240, 90, 90, 255), // red
    working: RGBA.fromInts(240, 200, 90, 255), // amber
    done: RGBA.fromInts(110, 170, 240, 255), // blue
    idle: RGBA.fromInts(120, 200, 130, 255), // green
    unknown: toRGBA(theme.fgMuted),
  };

  const [projects, setProjects] = createSignal<TeamProject[]>(listTeamProjects(tracker));
  const [selected, setSelected] = createSignal(0);
  // Inline "register a project dir" prompt.
  const [registerMode, setRegisterMode] = createSignal(false);
  const [registerInput, setRegisterInput] = createSignal(process.cwd());
  // Transient status line (errors / confirmations); lingers until next action.
  const [message, setMessage] = createSignal("");

  const rows = () => toRows(projects());

  function refresh() {
    const next = listTeamProjects(tracker);
    setProjects(next);
    const count = toRows(next).length;
    setSelected((s) => Math.max(0, Math.min(s, count - 1)));
  }

  onMount(() => {
    const timer = setInterval(refresh, 2000);
    onCleanup(() => clearInterval(timer));
  });

  function current(): Row | undefined {
    return rows()[selected()];
  }

  /** Attach the terminal to a session by name; returns after the user detaches. */
  function attachSessionName(name: string) {
    try {
      execFileSync("tmux", ["attach", "-t", name], { stdio: "inherit" });
    } catch {
      // detached or session gone — fall through
    }
    process.exit(0);
  }

  /**
   * Launch a project. When it has an `ide.yml`, run the full `tmux-ide` launch
   * (builds the layout and attaches) — this blocks until the user detaches, so
   * we refresh and stay in the cockpit rather than exit. Otherwise spin up a
   * bare detached session so it appears in place.
   */
  function launchProject(project: TeamProject) {
    if (!project.dir) return;
    if (project.hasIdeYml) {
      try {
        execFileSync("tmux-ide", [], { cwd: project.dir, stdio: "inherit" });
      } catch {
        // launch failed or user detached — fall through to refresh
      }
      refresh();
      return;
    }
    try {
      createDetachedSession(project.name, project.dir);
      setMessage(`launched ${project.name}`);
    } catch (e) {
      setMessage(String((e as { message?: string })?.message ?? e));
    }
    refresh();
  }

  /** Enter: attach on a session row; launch (or attach-first) on a project row. */
  function enter() {
    const row = current();
    if (!row) return;
    if (row.kind === "session") {
      attachSessionName(row.session.name);
      return;
    }
    const project = row.project;
    // A running project attaches its first session — nicer than re-launching.
    if (project.running && project.sessions.length > 0) {
      attachSessionName(project.sessions[0].name);
      return;
    }
    launchProject(project);
  }

  /** Kill only the tmux SESSION(s); the registry entry is untouched. */
  function kill() {
    const row = current();
    if (!row) return;
    if (row.kind === "session") {
      killSession(row.session.name);
    } else if (row.project.running) {
      for (const s of row.project.sessions) killSession(s.name);
    } else {
      return;
    }
    refresh();
  }

  /** Unregister a stopped, registered project — never orphan a live session. */
  function unregister() {
    const row = current();
    if (!row || row.kind !== "project") return;
    const project = row.project;
    if (!project.registered || project.running) return;
    try {
      unregisterProject(project.name);
      setMessage(`unregistered ${project.name}`);
    } catch (e) {
      setMessage(String((e as { message?: string })?.message ?? e));
    }
    refresh();
  }

  /** Submit the register-dir prompt (registerProject is async from a sync key). */
  function submitRegister() {
    const dir = registerInput().trim();
    registerProject({ dir })
      .then(() => {
        setRegisterMode(false);
        setMessage("registered");
        refresh();
      })
      .catch((e) => setMessage(String((e as { message?: string })?.message ?? e)));
  }

  useKeyboard((evt) => {
    // Register prompt swallows all keys while open.
    if (registerMode()) {
      if (evt.name === "escape") {
        setRegisterMode(false);
        setRegisterInput(process.cwd());
        return;
      }
      if (evt.name === "return") {
        submitRegister();
        return;
      }
      const next = nextInput(registerInput(), evt);
      if (next !== null) setRegisterInput(next);
      return;
    }

    const n = rows().length;
    if (evt.name === "q" || (evt.ctrl && evt.name === "c")) {
      process.exit(0);
    } else if (evt.name === "up" || evt.name === "k") {
      if (n > 0) setSelected((s) => (s - 1 + n) % n);
    } else if (evt.name === "down" || evt.name === "j") {
      if (n > 0) setSelected((s) => (s + 1) % n);
    } else if (evt.name === "return") {
      enter();
    } else if (evt.name === "l") {
      const row = current();
      if (row && row.kind === "project") launchProject(row.project);
    } else if (evt.name === "a") {
      setMessage("");
      setRegisterInput(process.cwd());
      setRegisterMode(true);
    } else if (evt.name === "d") {
      unregister();
    } else if (evt.name === "r") {
      refresh();
    } else if (evt.name === "x") {
      kill();
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} backgroundColor={toRGBA(theme.bg)}>
      {/* header */}
      <box paddingLeft={1} paddingRight={1} flexDirection="row" gap={1}>
        <text fg={toRGBA(theme.accent)}>tmux-ide</text>
        <text fg={toRGBA(theme.fgMuted)}>· team</text>
        <box flexGrow={1} />
        <text fg={toRGBA(theme.fgMuted)}>{`${projects().length} projects`}</text>
      </box>

      {/* register-dir prompt */}
      <Show when={registerMode()}>
        <box paddingLeft={1} paddingRight={1} flexDirection="row" gap={1}>
          <text fg={toRGBA(theme.accent)}>register dir:</text>
          <text fg={toRGBA(theme.fg)}>{registerInput()}</text>
          <text fg={toRGBA(theme.fgMuted)}>_</text>
        </box>
      </Show>

      {/* list */}
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} paddingTop={1}>
        <Show
          when={rows().length > 0}
          fallback={
            <text fg={toRGBA(theme.fgMuted)}>
              No projects or sessions. Register a project or start a tmux session to see it here.
            </text>
          }
        >
          <For each={rows()}>
            {(row, i) => {
              const isSel = () => i() === selected();
              return (
                <Show
                  when={row.kind === "project"}
                  fallback={
                    /* session row — indented under its project */
                    <box flexDirection="row" gap={1} paddingLeft={3} paddingRight={1}
                      backgroundColor={isSel() ? toRGBA(theme.border) : undefined}>
                      <text fg={isSel() ? toRGBA(theme.accent) : toRGBA(theme.fgMuted)}>
                        {isSel() ? "▸" : " "}
                      </text>
                      <text fg={statusColor[(row as { session: TeamSession }).session.status]}>
                        {STATUS[(row as { session: TeamSession }).session.status].glyph}
                      </text>
                      <text fg={toRGBA(theme.fg)}>
                        {(row as { session: TeamSession }).session.name.padEnd(22).slice(0, 22)}
                      </text>
                      <text fg={toRGBA(theme.fgMuted)}>
                        {STATUS[(row as { session: TeamSession }).session.status].label.padEnd(8)}
                      </text>
                      <text fg={toRGBA(theme.fgMuted)}>
                        {`${(row as { session: TeamSession }).session.panes}p`}
                      </text>
                      <text fg={toRGBA(theme.fgMuted)}>
                        {(row as { session: TeamSession }).session.attached ? "· attached" : ""}
                      </text>
                    </box>
                  }
                >
                  {/* project header row */}
                  {(() => {
                    const project = (row as { project: TeamProject }).project;
                    const running = project.running;
                    return (
                      <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}
                        backgroundColor={isSel() ? toRGBA(theme.border) : undefined}>
                        <text fg={isSel() ? toRGBA(theme.accent) : toRGBA(theme.fgMuted)}>
                          {isSel() ? "▸" : " "}
                        </text>
                        <text fg={running ? statusColor[project.status] : toRGBA(theme.fgMuted)}>
                          {running ? STATUS[project.status].glyph : "○"}
                        </text>
                        <text
                          fg={running ? toRGBA(theme.accent) : toRGBA(theme.fgMuted)}
                          attributes={running ? TextAttributes.BOLD : 0}
                        >
                          {project.name.padEnd(22).slice(0, 22)}
                        </text>
                        <text fg={toRGBA(theme.fgMuted)}>{running ? "" : "○ stopped"}</text>
                        <text fg={toRGBA(theme.fgMuted)}>{project.gitBranch ?? ""}</text>
                        <text fg={toRGBA(theme.fgMuted)}>{project.hasIdeYml ? "ide.yml" : ""}</text>
                        <box flexGrow={1} />
                        <text fg={toRGBA(theme.fgMuted)}>
                          {`${project.sessions.length} ${
                            project.sessions.length === 1 ? "session" : "sessions"
                          }`}
                        </text>
                      </box>
                    );
                  })()}
                </Show>
              );
            }}
          </For>
        </Show>
      </box>

      {/* transient status line */}
      <Show when={message().length > 0}>
        <box paddingLeft={1} paddingRight={1}>
          <text fg={toRGBA(theme.fgMuted)}>{message()}</text>
        </box>
      </Show>

      {/* footer */}
      <box paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}>
        <text fg={toRGBA(theme.fgMuted)}>↑↓ move</text>
        <text fg={toRGBA(theme.fgMuted)}>↵ launch/attach</text>
        <text fg={toRGBA(theme.fgMuted)}>l launch</text>
        <text fg={toRGBA(theme.fgMuted)}>a add</text>
        <text fg={toRGBA(theme.fgMuted)}>d unreg</text>
        <text fg={toRGBA(theme.fgMuted)}>x kill</text>
        <text fg={toRGBA(theme.fgMuted)}>r refresh</text>
        <text fg={toRGBA(theme.fgMuted)}>q quit</text>
      </box>
    </box>
  );
});
