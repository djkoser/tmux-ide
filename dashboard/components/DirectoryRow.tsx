"use client";

import { useState } from "react";
import Link from "next/link";
import { focusDirectory } from "@/lib/api";
import type { SessionOverview } from "@/lib/types";
import { ProgressBar } from "./ProgressBar";

interface DirectoryRowProps {
  session: SessionOverview;
}

export function DirectoryRow({ session: s }: DirectoryRowProps) {
  const pct =
    s.stats.totalTasks > 0 ? Math.round((s.stats.doneTasks / s.stats.totalTasks) * 100) : 0;

  const missionText = s.mission?.title ?? "—";
  const [focusState, setFocusState] = useState<"idle" | "busy" | "ok" | "error">("idle");

  async function onFocus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (focusState === "busy") return;
    setFocusState("busy");
    const result = await focusDirectory(s.name);
    setFocusState(result.ok ? "ok" : "error");
    setTimeout(() => setFocusState("idle"), 2000);
  }

  return (
    <Link href={`/directory/${encodeURIComponent(s.name)}`}>
      <div className="flex items-center px-4 h-7 hover:bg-[var(--surface)] cursor-pointer border-b border-[var(--border)] transition-colors">
        <span className="w-3 shrink-0">
          <span
            className={`inline-block w-[6px] h-[6px] ${
              s.stats.activeAgents > 0 ? "bg-[var(--green)]" : "bg-[var(--dim)]"
            }`}
          />
        </span>
        <span
          className="min-w-[20ch] max-w-[40ch] shrink-0 text-[var(--fg)] truncate"
          title={s.name}
        >
          {s.name}
        </span>
        <span className="flex-1 text-[var(--dim)] truncate pr-4">{missionText}</span>
        <span className="w-[12ch] flex justify-end shrink-0 overflow-hidden mr-6">
          <button
            onClick={onFocus}
            disabled={focusState === "busy"}
            className={`border border-[var(--border)] px-1.5 leading-4 transition-colors whitespace-nowrap max-w-full truncate ${
              focusState === "error"
                ? "text-[var(--red)]"
                : focusState === "ok"
                  ? "text-[var(--green)]"
                  : "text-[var(--dim)] hover:text-[var(--fg)] hover:border-[var(--fg)]"
            }`}
            title="Raise this session's terminal window"
          >
            {focusState === "ok" ? "✓ ok" : focusState === "error" ? "✗ fail" : "focus"}
          </button>
        </span>
        <span className="w-[16ch] flex justify-end shrink-0">
          <ProgressBar percent={pct} width={8} />
        </span>
        <span className="w-[8ch] text-right shrink-0 text-[var(--dim)]">
          {s.stats.activeAgents}/{s.stats.agents}
        </span>
        <span className="w-[10ch] text-right shrink-0">
          <span className="text-[var(--green)]">{s.stats.doneTasks}</span>
          <span className="text-[var(--dim)]">/{s.stats.totalTasks}</span>
        </span>
      </div>
    </Link>
  );
}
