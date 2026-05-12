/**
 * SkillsView — Solid port of dashboard/components/skills/SkillsView.tsx
 * (retired in the U5 orphan sweep). Restores the /v2 "Skills" surface.
 *
 * Two-pane composite: a left rail listing project skills + a right
 * detail panel rendering the selected skill's markdown body. Skills
 * are owned by the host (the React bridge calls
 * `/api/project/:name/skills` and pushes the list via `setOptions`).
 * The widget owns the selected-skill id + search filter.
 *
 * Body markdown is rendered through `marked` and dropped into a
 * `.chat-markdown` wrapper so it picks up the global typography block
 * (PR 4 of the design rollout). Skill content is project-local data,
 * not adversarial — XSS is out of scope. If a future surface ever
 * sources skill body from external input, sanitize at the boundary.
 *
 * Semantic data-* hooks for tests + CSS overrides:
 *   - data-testid="skills-view"
 *   - data-testid="skills-rail" / "skills-detail"
 *   - data-testid="skill-row-<name>" + data-skill-name + data-selected
 *   - data-testid="skill-detail-name" / "skill-detail-body"
 *   - data-testid="skills-search"
 *   - data-empty-state on the empty rail + empty detail
 */

import { createMemo, createSignal, For, Show } from "solid-js";
import { marked } from "marked";
import type { SkillsViewMountOptions, SkillSummary } from "../types";

interface SkillsViewProps {
  options: () => SkillsViewMountOptions;
}

function roleLabel(role: string | undefined): string {
  if (!role) return "teammate";
  return role.toLowerCase();
}

function renderMarkdown(body: string): string {
  if (!body.trim()) return "";
  try {
    const out = marked.parse(body, { async: false });
    return typeof out === "string" ? out : "";
  } catch {
    return "";
  }
}

export function SkillsViewView(props: SkillsViewProps) {
  const initialSelected =
    props.options().initialSelected ?? null;
  const [selected, setSelected] = createSignal<string | null>(initialSelected);
  const [query, setQuery] = createSignal("");

  const allSkills = createMemo<ReadonlyArray<SkillSummary>>(
    () => props.options().skills ?? [],
  );

  // Filter by search. The match scans name, description, role, specialties.
  const filtered = createMemo<SkillSummary[]>(() => {
    const q = query().trim().toLowerCase();
    const list = allSkills();
    if (!q) return [...list];
    return list.filter((s) => {
      const hay = `${s.name} ${s.description ?? ""} ${s.role ?? ""} ${(s.specialties ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  });

  // Resolve the selected skill summary against the live list.
  const activeSkill = createMemo<SkillSummary | null>(() => {
    const id = selected();
    if (!id) return null;
    const match = allSkills().find((s) => s.name === id);
    if (match) return match;
    return null;
  });

  // Auto-select the first filtered row when the current selection vanishes
  // (e.g. search query that excludes it) — keeps the detail panel useful.
  const visibleSelection = createMemo<SkillSummary | null>(() => {
    const cur = activeSkill();
    if (cur && filtered().some((s) => s.name === cur.name)) return cur;
    const first = filtered()[0];
    return first ?? null;
  });

  function handleRowClick(name: string) {
    setSelected(name);
    props.options().onSelect?.(name);
  }

  const bodyHtml = createMemo<string>(() => {
    const skill = visibleSelection();
    if (!skill || !skill.body) return "";
    return renderMarkdown(skill.body);
  });

  return (
    <div
      data-testid="skills-view"
      style={{
        display: "flex",
        height: "100%",
        "min-height": "0",
        width: "100%",
        "background-color": "var(--bg)",
        color: "var(--fg)",
        "font-family": "var(--font-family-mono, var(--font-mono))",
        "font-size": "12px",
      }}
    >
      {/* ----- Left rail ------------------------------------------------ */}
      <aside
        data-testid="skills-rail"
        style={{
          flex: "0 0 280px",
          "min-width": "0",
          display: "flex",
          "flex-direction": "column",
          "border-right": "1px solid var(--border)",
          "background-color": "var(--bg-weak, var(--bg))",
        }}
      >
        <header
          style={{
            display: "flex",
            "align-items": "center",
            gap: "6px",
            padding: "8px 10px",
            "border-bottom": "1px solid var(--border-weak, var(--border))",
          }}
        >
          <span
            style={{
              color: "var(--fg-muted, var(--fg-soft))",
              "font-size": "10px",
              "text-transform": "uppercase",
              "letter-spacing": "0.08em",
            }}
          >
            Skills
          </span>
          <span
            data-testid="skills-count"
            style={{
              "margin-left": "auto",
              color: "var(--dim)",
              "font-size": "10px",
              "font-variant-numeric": "tabular-nums",
            }}
          >
            {filtered().length}/{allSkills().length}
          </span>
        </header>
        <div style={{ padding: "6px 8px" }}>
          <input
            data-testid="skills-search"
            type="search"
            placeholder="Search skills…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            style={{
              width: "100%",
              padding: "4px 8px",
              "border-radius": "4px",
              border: "1px solid var(--border)",
              "background-color": "var(--bg)",
              color: "var(--fg)",
              "font-family": "inherit",
              "font-size": "11px",
            }}
          />
        </div>
        <div
          style={{
            flex: "1 1 0%",
            "min-height": "0",
            "overflow-y": "auto",
            padding: "0 4px 6px",
          }}
        >
          <Show
            when={filtered().length > 0}
            fallback={
              <div
                data-empty-state
                style={{
                  color: "var(--dim)",
                  "font-size": "11px",
                  padding: "16px 8px",
                  "text-align": "center",
                }}
              >
                <Show
                  when={allSkills().length === 0}
                  fallback="No matches."
                >
                  — no skills registered —
                </Show>
              </div>
            }
          >
            <For each={filtered()}>
              {(skill) => {
                const isActive = () =>
                  visibleSelection()?.name === skill.name;
                return (
                  <button
                    type="button"
                    data-testid={`skill-row-${skill.name}`}
                    data-skill-name={skill.name}
                    data-selected={isActive() ? "true" : "false"}
                    onClick={() => handleRowClick(skill.name)}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "6px",
                      width: "100%",
                      padding: "6px 8px",
                      "border-radius": "4px",
                      border: "none",
                      "background-color": isActive()
                        ? "color-mix(in oklab, var(--accent) 14%, transparent)"
                        : "transparent",
                      color: isActive() ? "var(--accent)" : "var(--fg)",
                      "font-family": "inherit",
                      "font-size": "12px",
                      "text-align": "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: "7px",
                        height: "7px",
                        "border-radius": "50%",
                        "background-color": isActive()
                          ? "var(--accent)"
                          : "var(--dim)",
                      }}
                    />
                    <span
                      style={{
                        flex: "1 1 0%",
                        "min-width": "0",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap",
                      }}
                      title={skill.description ?? skill.name}
                    >
                      {skill.name}
                    </span>
                    <Show when={skill.specialties && skill.specialties.length > 0}>
                      <span
                        style={{
                          color: "var(--fg-muted, var(--fg-soft))",
                          "font-size": "10px",
                        }}
                      >
                        {skill.specialties![0]}
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </aside>

      {/* ----- Right detail --------------------------------------------- */}
      <section
        data-testid="skills-detail"
        style={{
          flex: "1 1 0%",
          "min-width": "0",
          display: "flex",
          "flex-direction": "column",
          "min-height": "0",
        }}
      >
        <Show
          when={visibleSelection()}
          fallback={
            <div
              data-empty-state
              style={{
                flex: "1 1 0%",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                color: "var(--dim)",
                "font-size": "12px",
                padding: "40px 12px",
              }}
            >
              <Show
                when={allSkills().length === 0}
                fallback="Select a skill from the rail."
              >
                — no skills registered for this project —
              </Show>
            </div>
          }
        >
          {(skillAccessor) => (
            <>
              <header
                style={{
                  display: "flex",
                  "flex-wrap": "wrap",
                  "align-items": "baseline",
                  gap: "10px",
                  padding: "10px 14px",
                  "border-bottom": "1px solid var(--border)",
                  "background-color": "var(--bg-weak, var(--bg))",
                }}
              >
                <h2
                  data-testid="skill-detail-name"
                  style={{
                    margin: "0",
                    "font-size": "14px",
                    "font-weight": "600",
                    color: "var(--fg)",
                  }}
                >
                  {skillAccessor().name}
                </h2>
                <span
                  data-testid="skill-detail-role"
                  style={{
                    padding: "1px 6px",
                    "border-radius": "10px",
                    "background-color":
                      "color-mix(in oklab, var(--accent) 14%, transparent)",
                    color: "var(--accent)",
                    "font-size": "10px",
                    "text-transform": "uppercase",
                    "letter-spacing": "0.04em",
                  }}
                >
                  {roleLabel(skillAccessor().role)}
                </span>
                <Show
                  when={
                    skillAccessor().specialties &&
                    skillAccessor().specialties!.length > 0
                  }
                >
                  <div
                    data-testid="skill-detail-specialties"
                    style={{ display: "flex", gap: "4px", "flex-wrap": "wrap" }}
                  >
                    <For each={skillAccessor().specialties!}>
                      {(s) => (
                        <span
                          style={{
                            padding: "1px 6px",
                            "border-radius": "10px",
                            border: "1px solid var(--border-weak, var(--border))",
                            color: "var(--fg-muted, var(--fg-soft))",
                            "font-size": "10px",
                          }}
                        >
                          {s}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </header>
              <Show when={skillAccessor().description}>
                <p
                  data-testid="skill-detail-description"
                  style={{
                    margin: "0",
                    padding: "10px 14px",
                    "border-bottom": "1px solid var(--border-weak, var(--border))",
                    color: "var(--fg-muted, var(--fg-soft))",
                    "font-size": "12px",
                    "line-height": "1.5",
                  }}
                >
                  {skillAccessor().description}
                </p>
              </Show>
              <div
                style={{
                  flex: "1 1 0%",
                  "min-height": "0",
                  "overflow-y": "auto",
                  padding: "12px 14px 24px",
                }}
              >
                <Show
                  when={skillAccessor().body && skillAccessor().body!.trim()}
                  fallback={
                    <div
                      data-empty-state
                      style={{
                        color: "var(--dim)",
                        "font-size": "11px",
                        "font-style": "italic",
                      }}
                    >
                      — empty body —
                    </div>
                  }
                >
                  <div
                    class="chat-markdown"
                    data-testid="skill-detail-body"
                    // eslint-disable-next-line solid/no-innerhtml
                    innerHTML={bodyHtml()}
                  />
                </Show>
              </div>
            </>
          )}
        </Show>
      </section>
    </div>
  );
}
