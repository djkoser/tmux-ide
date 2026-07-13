"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import {
  fetchPlans,
  fetchPlan,
  savePlan,
  type PlanSummary,
  type PlanData,
  type AuthorshipData,
} from "@/lib/api";
import { decideSaveContent } from "@/lib/plan-save";
import { usePolling } from "@/lib/usePolling";
import { AuthorshipBar } from "./AuthorshipBar";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

interface PlansPanelProps {
  sessionName: string;
}

interface MarkdownSection {
  heading: string;
  content: string;
  author: string | null;
  authorAt: string | null;
}

function splitIntoSections(markdown: string, authorship: AuthorshipData | null): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      if (currentLines.length > 0 || currentHeading) {
        const sectionAuth = authorship?.sections[currentHeading] ?? null;
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n"),
          author: sectionAuth?.author ?? null,
          authorAt: sectionAuth?.at ?? null,
        });
      }
      currentHeading = headingMatch[1]!.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0 || currentHeading) {
    const sectionAuth = authorship?.sections[currentHeading] ?? null;
    sections.push({
      heading: currentHeading,
      content: currentLines.join("\n"),
      author: sectionAuth?.author ?? null,
      authorAt: sectionAuth?.at ?? null,
    });
  }

  return sections;
}

function isAiAuthor(author: string | null): boolean {
  if (!author) return false;
  return author.startsWith("ai");
}

function formatAuthorTime(at: string | null): string {
  if (!at) return "";
  try {
    const d = new Date(at);
    const ms = Date.now() - d.getTime();
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
    return `${Math.floor(ms / 86400000)}d ago`;
  } catch {
    return "";
  }
}

export function PlansPanel({ sessionName }: PlansPanelProps) {
  const fetcher = useCallback(() => fetchPlans(sessionName), [sessionName]);
  const { data: plans, loading } = usePolling<PlanSummary[]>(fetcher, 10000);

  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData>({ content: "", authorship: null });
  const [loadingContent, setLoadingContent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Plans have no status lifecycle — narrow the list by a name search instead.
  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    const q = query.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) => p.name.toLowerCase().includes(q));
  }, [plans, query]);

  useEffect(() => {
    if (!selectedFile) {
      setPlanData({ content: "", authorship: null });
      setEditing(false);
      return;
    }
    setLoadingContent(true);
    setEditing(false);
    fetchPlan(sessionName, selectedFile)
      .then((d) => {
        setPlanData(d);
        setEditContent(d.content);
      })
      .catch(() => setPlanData({ content: "", authorship: null }))
      .finally(() => setLoadingContent(false));
  }, [selectedFile, sessionName]);

  useEffect(() => {
    if (!selectedFile && filteredPlans.length > 0) {
      setSelectedFile(filteredPlans[0]!.path);
    }
  }, [filteredPlans, selectedFile]);

  const sections = useMemo(
    () => splitIntoSections(planData.content, planData.authorship),
    [planData],
  );

  // Read the live editor document and persist it. A serialization failure or an
  // unmounted editor blocks the save and surfaces an error rather than writing a
  // stale snapshot, so the user never silently loses edits.
  async function requestSave() {
    if (!selectedFile) return;
    let live: string | null = null;
    let serializeFailed = false;
    try {
      live = editorRef.current?.getLiveMarkdown() ?? null;
    } catch {
      serializeFailed = true;
    }
    const decision = decideSaveContent(live, serializeFailed);
    if (!decision.save) {
      setSaveError(
        decision.reason === "serialize-error"
          ? "Could not read your edits from the editor — save aborted so nothing is lost. Try again."
          : "Editor is still loading — try again in a moment.",
      );
      return;
    }

    setSaveError(null);
    setSaving(true);
    const ok = await savePlan(sessionName, selectedFile, decision.content);
    if (ok) {
      const d = await fetchPlan(sessionName, selectedFile);
      setPlanData(d);
      setEditContent(d.content);
      setEditing(false);
    } else {
      setSaveError(
        "Save failed — the server rejected the write. Your edits are still in the editor.",
      );
    }
    setSaving(false);
  }

  if (loading && !plans) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--dim)]">
        Loading plans...
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--dim)]">
        No plan files found in plans/
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Sidebar */}
      <div className="w-[260px] shrink-0 border-r border-[var(--border)] flex flex-col min-h-0">
        {/* Search */}
        <div className="h-7 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 flex items-center px-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search plans…"
            className="w-full bg-transparent text-[12px] text-[var(--fg)] px-1 outline-none placeholder:text-[var(--dim)]"
            aria-label="search plans"
          />
        </div>

        {/* Plan list */}
        <div className="flex-1 overflow-y-auto">
          {filteredPlans.map((p) => {
            const isSelected = selectedFile === p.path;
            return (
              <button
                key={p.path}
                onClick={() => setSelectedFile(p.path)}
                className={`w-full text-left px-2 py-1 transition-colors ${
                  isSelected
                    ? "bg-[rgba(255,255,255,0.04)] text-[var(--accent)]"
                    : "text-[var(--fg)] hover:bg-[rgba(255,255,255,0.02)]"
                }`}
              >
                <span className="block truncate text-[12px]">{p.name}</span>
              </button>
            );
          })}
          {filteredPlans.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-[var(--dim)]">no plans match</div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {loadingContent ? (
          <div className="flex-1 flex items-center justify-center text-[var(--dim)]">
            loading...
          </div>
        ) : planData.content || editing ? (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-[var(--border)] px-3 flex items-center h-7">
              <div className="flex-1 flex items-center gap-2">
                <AuthorshipBar authorship={planData.authorship} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editing && (
                  <>
                    {saveError && (
                      <span
                        className="text-[10px] text-[var(--danger,#e5484d)] max-w-[360px] truncate"
                        title={saveError}
                      >
                        {saveError}
                      </span>
                    )}
                    <button
                      onClick={requestSave}
                      disabled={saving}
                      className="text-[11px] px-2 py-0.5 text-[var(--bg)] bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {saving ? "saving..." : "save"}
                    </button>
                    <span className="text-[9px] text-[var(--dimmer)]">cmd+S</span>
                  </>
                )}
                <button
                  onClick={() =>
                    editing
                      ? (setEditing(false), setSaveError(null))
                      : (() => {
                          setEditContent(planData.content);
                          setSaveError(null);
                          setEditing(true);
                        })()
                  }
                  className={`text-[11px] px-2 py-0.5 border border-[var(--border)] transition-colors ${
                    editing
                      ? "text-[var(--accent)] border-[var(--accent)]"
                      : "text-[var(--dim)] hover:text-[var(--fg)] hover:border-[var(--dim)]"
                  }`}
                >
                  {editing ? "view" : "edit"}
                </button>
              </div>
            </div>

            {/* Content */}
            {editing ? (
              <MarkdownEditor
                ref={editorRef}
                key={selectedFile}
                value={editContent}
                onRequestSave={requestSave}
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-4 max-w-3xl">
                {sections.map((section, i) => {
                  const ai = isAiAuthor(section.author);
                  const borderColor = section.author
                    ? ai
                      ? "var(--ai-color)"
                      : "var(--human-color)"
                    : "transparent";
                  const bgColor = section.author
                    ? ai
                      ? "var(--ai-bg)"
                      : "var(--human-bg)"
                    : "transparent";
                  const timeLabel = formatAuthorTime(section.authorAt);

                  return (
                    <div
                      key={`${section.heading}-${i}`}
                      className="plan-content"
                      style={{
                        borderLeft: section.author
                          ? `2px solid ${borderColor}`
                          : "2px solid transparent",
                        paddingLeft: "12px",
                        marginBottom: "4px",
                        background: bgColor,
                        borderRadius: "2px",
                      }}
                    >
                      {section.author && section.heading && (
                        <div className="flex items-center gap-2 mb-1 -mt-0.5">
                          <span
                            className="text-[9px] px-1 py-px rounded"
                            style={{
                              color: ai ? "var(--ai-color)" : "var(--human-color)",
                              background: ai ? "var(--ai-badge)" : "var(--human-badge)",
                            }}
                          >
                            {section.author}
                          </span>
                          {timeLabel && (
                            <span className="text-[9px] text-[var(--dimmer)]">{timeLabel}</span>
                          )}
                        </div>
                      )}
                      <Markdown>{section.content}</Markdown>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--dim)]">
            Select a plan to view
          </div>
        )}
      </div>
    </div>
  );
}
