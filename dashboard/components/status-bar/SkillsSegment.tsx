"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchSkills, type SkillData } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { StatusPopover } from "./StatusPopover";
import { projectNameFromPath } from "./projectPath";

export function SkillsSegment() {
  const pathname = usePathname();
  const project = projectNameFromPath(pathname);
  const [open, setOpen] = useState(false);
  const fetcher = useCallback(
    () => (project ? fetchSkills(project) : Promise.resolve([])),
    [project],
  );
  const { data } = usePolling<SkillData[]>(fetcher, 10000);

  if (!project || !data) return null;

  return (
    <>
      <span className="mx-2 opacity-30">│</span>
      <span className="relative inline-flex items-center">
        <button
          type="button"
          data-testid="status-segment-skills"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center text-left text-[var(--dim)] transition-colors hover:text-[var(--fg)]"
        >
          {data.length > 0 ? `${data.length} skills` : "—"}
        </button>
        <StatusPopover open={open} onClose={() => setOpen(false)}>
          <div className="space-y-2">
            <div className="text-[var(--accent)]">skills</div>
            {data.length === 0 ? (
              <div className="text-[var(--dim)]">no skills</div>
            ) : (
              <div className="flex max-w-sm flex-wrap gap-1">
                {data.map((skill) => (
                  <span
                    key={skill.name}
                    className="border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--cyan)]"
                    title={skill.specialties.join(", ")}
                  >
                    {skill.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </StatusPopover>
      </span>
    </>
  );
}
