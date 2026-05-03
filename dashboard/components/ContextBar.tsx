"use client";

import { usePathname } from "next/navigation";
import { fetchMission, injectIntoProject } from "@/lib/api";
import { useLayoutState } from "@/lib/useLayoutState";
import { useToasts } from "@/lib/useToasts";

type ContextActionId = "mission" | "recap" | "status" | "redispatch";

const buttons: { id: ContextActionId; label: string }[] = [
  { id: "mission", label: "Mission" },
  { id: "recap", label: "Recap" },
  { id: "status", label: "Status" },
  { id: "redispatch", label: "Re-dispatch" },
];

function projectFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

async function promptForAction(projectName: string, id: ContextActionId): Promise<string | null> {
  if (id === "mission") {
    const mission = await fetchMission(projectName);
    if (!mission) return null;
    const { title, description } = mission.mission;
    return [`Mission: ${title}`, description].filter(Boolean).join("\n\n");
  }
  if (id === "recap") return "Recap what you've done since the last task";
  if (id === "status") return "/status";
  return "Please continue the active task";
}

export function ContextBar() {
  const pathname = usePathname();
  const projectName = projectFromPath(pathname);
  const { terminalOpen } = useLayoutState();
  const { push } = useToasts();

  if (!terminalOpen || !projectName) return null;

  async function inject(id: ContextActionId) {
    if (!projectName) return;
    try {
      const text = await promptForAction(projectName, id);
      if (!text) {
        push({ kind: "error", title: "Failed to inject", body: "No mission found" });
        return;
      }
      const ok = await injectIntoProject(projectName, text, { sendEnter: false });
      push({
        kind: ok ? "success" : "error",
        title: ok ? "Sent to agent" : "Failed to inject",
      });
    } catch (error) {
      push({
        kind: "error",
        title: "Failed to inject",
        body: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div
      data-testid="context-bar"
      className="flex h-8 shrink-0 items-center gap-1.5 border-b border-[var(--border-weak)] bg-[var(--surface)] px-2"
    >
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          data-testid={`context-bar-button-${button.id}`}
          onClick={() => void inject(button.id)}
          className="h-6 rounded border border-[var(--border)] bg-[var(--bg)] px-2 text-[11px] text-[var(--fg-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
