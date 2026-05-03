"use client";

import { Folder, LayoutDashboard, Send, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchSessions, fetchSkills, injectIntoProject, type SkillData } from "@/lib/api";
import { useLayoutState } from "@/lib/useLayoutState";
import { useToasts } from "@/lib/useToasts";
import type { SessionOverview } from "@/lib/types";

interface SidebarProps {
  className?: string;
  testId?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className = "", testId = "sidebar", onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [error, setError] = useState(false);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState(false);
  const { push } = useToasts();
  const {
    activitySection,
    activeWorkspaceTabId,
    workspaceTabs,
    openWorkspaceTab,
    setActivitySection,
  } = useLayoutState();

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await fetchSessions();
        if (!active) return;
        setSessions(data);
        setError(false);
        setSessionsLoading(false);
      } catch {
        if (active) {
          setError(true);
          setSessionsLoading(false);
        }
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const activeProject = pathname.startsWith("/project/")
    ? decodeURIComponent(pathname.replace(/^\/project\//, "").replace(/\/$/, ""))
    : null;
  const onOverview = pathname === "/" || pathname === "";
  const activeWorkspaceTab = workspaceTabs.find((tab) => tab.id === activeWorkspaceTabId);
  const settingsActive = activeWorkspaceTab?.kind === "settings";

  useEffect(() => {
    if (activitySection !== "skills" || !activeProject) {
      setSkills([]);
      setSkillsLoading(false);
      setSkillsError(false);
      return;
    }

    const projectName = activeProject;
    let active = true;
    setSkillsLoading(true);
    async function loadSkills() {
      try {
        const data = await fetchSkills(projectName);
        if (!active) return;
        setSkills(data);
        setSkillsError(false);
        setSkillsLoading(false);
      } catch {
        if (active) {
          setSkillsError(true);
          setSkillsLoading(false);
        }
      }
    }

    void loadSkills();
    return () => {
      active = false;
    };
  }, [activeProject, activitySection]);

  async function injectSkill(skill: SkillData) {
    if (!activeProject) return;
    const ok = await injectIntoProject(activeProject, `<load skill: ${skill.name}>`, {
      sendEnter: false,
    });
    push({
      kind: ok ? "success" : "error",
      title: ok ? "Sent to agent" : "Failed to inject",
      body: skill.name,
    });
  }

  return (
    <aside
      data-testid={testId}
      className={`w-56 shrink-0 border-r border-[var(--border-weak)] bg-[var(--bg-strong)] flex flex-col text-[12px] ${className}`}
    >
      <Link
        href="/"
        onClick={() => {
          setActivitySection("sessions");
          onNavigate?.();
        }}
        data-active={onOverview || undefined}
        className={`h-8 px-3 flex items-center gap-2 border-b border-[var(--border-weak)] tracking-[0.02em] transition-colors motion-safe:active:scale-[0.98] ${
          onOverview ? "text-[var(--accent)]" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
        }`}
      >
        <LayoutDashboard aria-hidden="true" size={13} />
        <span>overview</span>
      </Link>

      {activitySection === "settings" ? (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
            <Settings aria-hidden="true" size={11} />
            settings
          </div>
          <button
            type="button"
            data-testid="sidebar-settings"
            data-active={settingsActive ? "true" : undefined}
            onClick={() => {
              openWorkspaceTab("settings", null, "Settings");
              setActivitySection("settings");
              router.push("/");
              onNavigate?.();
            }}
            className={`mx-0 flex items-center gap-2 px-3 py-1.5 text-left transition-colors motion-safe:active:scale-[0.98] ${
              settingsActive
                ? "border-l-2 border-[var(--accent)] bg-[var(--surface-active)] text-[var(--accent)]"
                : "border-l-2 border-transparent text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
            }`}
          >
            <Settings aria-hidden="true" size={13} />
            Settings
          </button>
        </>
      ) : activitySection === "skills" ? (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
            <Sparkles aria-hidden="true" size={11} />
            skills
          </div>

          {!activeProject && (
            <div className="px-3 py-2 text-[var(--dim)] text-[11px]">
              open a project to load skills
            </div>
          )}

          {activeProject && skillsError && (
            <div className="px-3 py-2 text-[var(--red)] text-[11px]">skills unavailable</div>
          )}

          {activeProject && skillsLoading && (
            <div className="px-3 py-2">
              <SkeletonLine className="w-3/4" />
              <SkeletonLine className="mt-2 w-1/2" />
            </div>
          )}

          {activeProject && !skillsLoading && !skillsError && skills.length === 0 && (
            <div className="px-3 py-2 text-[var(--dim)] text-[11px]">no skills</div>
          )}

          <nav className="flex-1 overflow-y-auto pb-2">
            {skills.map((skill) => (
              <div
                key={skill.name}
                className="group flex items-stretch border-l-2 border-transparent transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]"
              >
                <button
                  type="button"
                  data-testid={`sidebar-skill-${skill.name}`}
                  onClick={() => {
                    if (!activeProject) return;
                    openWorkspaceTab("skill", activeProject, `Skill · ${skill.name}`, skill.name);
                    onNavigate?.();
                  }}
                  className="min-w-0 flex-1 px-3 py-2 text-left text-[var(--fg-secondary)] transition-colors motion-safe:active:scale-[0.98] hover:text-[var(--fg)]"
                  title={`Open ${skill.name}`}
                  disabled={!activeProject}
                >
                  <span className="block truncate text-[12px]">{skill.name}</span>
                  {skill.specialties[0] && (
                    <span className="mt-1 inline-block max-w-full truncate rounded-sm border border-[var(--border-weak)] bg-[var(--surface)] px-1 text-[10px] text-[var(--cyan)]">
                      {skill.specialties[0]}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  data-testid={`sidebar-skill-inject-${skill.name}`}
                  onClick={() => void injectSkill(skill)}
                  className="flex w-7 shrink-0 items-center justify-center text-[var(--dim)] opacity-0 transition-opacity motion-safe:active:scale-[0.95] hover:text-[var(--accent)] group-hover:opacity-100"
                  title={`Send ${skill.name} to active agent`}
                  aria-label={`Send ${skill.name} to active agent`}
                  disabled={!activeProject}
                >
                  <Send aria-hidden="true" size={13} />
                </button>
              </div>
            ))}
          </nav>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
            <Folder aria-hidden="true" size={11} />
            sessions
          </div>

          {error && <div className="px-3 py-2 text-[var(--red)] text-[11px]">api unreachable</div>}

          {!error && sessionsLoading && (
            <div className="px-3 py-2">
              <SkeletonLine className="w-4/5" />
              <SkeletonLine className="mt-2 w-2/3" />
              <SkeletonLine className="mt-2 w-3/5" />
            </div>
          )}

          {!error && !sessionsLoading && sessions.length === 0 && (
            <div className="mx-3 mt-2 rounded-md border border-[var(--border-weak)] bg-[var(--surface)] px-3 py-4 text-center text-[11px] text-[var(--dim)]">
              <Folder
                aria-hidden="true"
                size={24}
                strokeWidth={1.5}
                className="mx-auto mb-2 text-[var(--accent)]"
              />
              <div className="text-[var(--fg-secondary)]">No sessions</div>
              <div className="mt-1 leading-5">Run tmux-ide init in a project to create one.</div>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto pb-2">
            {sessions.map((session) => {
              const isActive = activeProject === session.name;
              return (
                <Link
                  key={session.name}
                  href={`/project/${encodeURIComponent(session.name)}`}
                  data-testid={`sidebar-session-${session.name}`}
                  data-active={isActive || undefined}
                  onClick={() => {
                    openWorkspaceTab("project", session.name, session.name);
                    setActivitySection("sessions");
                    onNavigate?.();
                  }}
                  className={`group block px-3 py-1.5 transition-colors motion-safe:active:scale-[0.98] ${
                    isActive
                      ? "bg-[var(--surface-active)] text-[var(--accent)] border-l-2 border-[var(--accent)]"
                      : "text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate flex-1">{session.name}</span>
                    {session.stats && session.stats.totalTasks > 0 && (
                      <span className="text-[10px] tabular-nums text-[var(--dim)] group-hover:text-[var(--fg-secondary)]">
                        {session.stats.doneTasks}/{session.stats.totalTasks}
                      </span>
                    )}
                  </div>
                  {session.mission?.title && (
                    <div className="text-[10px] text-[var(--dim)] truncate mt-0.5">
                      {session.mission.title}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </aside>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-3 rounded-sm bg-[var(--surface)] motion-safe:animate-pulse ${className}`}
    />
  );
}
