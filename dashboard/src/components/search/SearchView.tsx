/**
 * SearchView — Cmd+Shift+F repo search panel (G19-P2).
 *
 * Layout matches the audit's §3 mockup:
 *
 *   ┌─ Search ────────────────────────────────┐
 *   │ Query input                             │
 *   │ Replace input (collapsible)             │
 *   │ [Aa] [.*] toggles + include/exclude     │
 *   │ N results in M files (Xms)              │
 *   │ ▾ src/foo.ts        (5 matches)         │
 *   │   12  // TODO: refactor                 │
 *   │   ...                                   │
 *   └─────────────────────────────────────────┘
 *
 * State + streaming lives in `@/lib/search` — this file is pure
 * render + event wiring. Click on a match row navigates to
 * `?view=files&path=<path>&line=<line>` so the Files surface
 * (G17-P4/5 — owned by another silo) can open the file at the
 * cursor; the parent route handles the navigation.
 */

import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Pencil,
  Regex,
  Search as SearchIcon,
  X,
} from "lucide-solid";
import {
  makeSearchService,
  segmentLine,
  type FileMatch,
  type ReplaceResult,
  type SearchService,
} from "@/lib/search";

const SEARCH_DEBOUNCE_MS = 250;

interface SearchViewProps {
  projectName: string;
}

export function SearchView(props: SearchViewProps): JSX.Element {
  let service!: SearchService;
  let queryInputRef: HTMLInputElement | undefined;
  const [replaceOpen, setReplaceOpen] = createSignal(false);
  const [confirmAcrossFiles, setConfirmAcrossFiles] = createSignal(false);
  const [pendingReplace, setPendingReplace] = createSignal<ReplaceResult | null>(null);
  const [replaceError, setReplaceError] = createSignal<string | null>(null);
  const navigate = useNavigate();

  service = makeSearchService(props.projectName);

  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  function scheduleRun(): void {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
      debounceHandle = null;
      void service.run();
    }, SEARCH_DEBOUNCE_MS);
  }

  onMount(() => {
    queryInputRef?.focus();
  });
  onCleanup(() => {
    if (debounceHandle) clearTimeout(debounceHandle);
    service.cancel();
  });

  const totals = createMemo(() => {
    const summary = service.state.summary;
    const fileCount = service.state.fileOrder.length;
    return { matches: summary?.matches ?? 0, fileCount, elapsedMs: summary?.elapsedMs ?? 0 };
  });

  function onQueryInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    service.setQuery(value);
    if (value.trim().length === 0) {
      service.cancel();
      service.run().catch(() => undefined);
      return;
    }
    scheduleRun();
  }

  function openFile(path: string, line: number): void {
    const search = new URLSearchParams();
    search.set("view", "files");
    search.set("path", path);
    search.set("line", String(line));
    navigate(`/v2/project/${encodeURIComponent(props.projectName)}?${search.toString()}`);
  }

  function buildReplaceFilesPayload(targetPaths: string[]) {
    return targetPaths
      .map((path) => {
        const file = service.state.byFile[path];
        if (!file) return null;
        return {
          path,
          expectedMtimeMs: file.snapshotMs,
          replacements: file.matches.flatMap((m) =>
            m.submatches.map((sm) => ({
              line: m.line,
              column: sm.start,
              length: sm.end - sm.start,
            })),
          ),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  async function replacePaths(paths: string[]): Promise<void> {
    setReplaceError(null);
    setPendingReplace(null);
    try {
      const result = await service.replace({
        files: buildReplaceFilesPayload(paths),
        replacement: service.replaceWith(),
      });
      setPendingReplace(result);
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : String(err));
    }
  }

  function replaceAllConfirmed(): void {
    const paths = [...service.state.fileOrder];
    setConfirmAcrossFiles(false);
    void replacePaths(paths);
  }

  function totalMatchesAcrossFiles(): number {
    return service.state.fileOrder.reduce((sum, path) => {
      const f = service.state.byFile[path];
      if (!f) return sum;
      return sum + f.matches.reduce((s, m) => s + m.submatches.length, 0);
    }, 0);
  }

  return (
    <div
      data-testid="search-view"
      class="flex h-full min-h-0 w-full flex-col bg-[var(--bg)] text-[var(--fg)]"
    >
      <header class="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2 text-[11px] uppercase tracking-wide text-[var(--dim)]">
        <span class="font-medium text-[var(--fg)]">Search</span>
        <span>Cmd+Shift+F</span>
      </header>

      <div class="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--bg-weak)] px-3 py-2">
        <div class="relative">
          <SearchIcon
            class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--dim)]"
            size={14}
          />
          <input
            ref={queryInputRef}
            data-testid="search-query"
            value={service.query()}
            onInput={onQueryInput}
            placeholder="Search workspace…"
            class="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-7 pr-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
            spellcheck={false}
            autocomplete="off"
          />
        </div>

        <Show when={replaceOpen()}>
          <div class="relative">
            <Pencil
              class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--dim)]"
              size={14}
            />
            <input
              data-testid="replace-input"
              value={service.replaceWith()}
              onInput={(event) =>
                service.setReplaceWith((event.currentTarget as HTMLInputElement).value)
              }
              placeholder="Replace with…"
              class="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-7 pr-2 text-[12px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
              spellcheck={false}
              autocomplete="off"
            />
          </div>
        </Show>

        <div class="flex items-center gap-1">
          <ToggleButton
            label="Case sensitive"
            testId="toggle-case"
            active={service.options().case === "sensitive"}
            onClick={() =>
              service.setOptions({
                case: service.options().case === "sensitive" ? "smart" : "sensitive",
              })
            }
            icon={<CaseSensitive size={14} />}
          />
          <ToggleButton
            label="Regex"
            testId="toggle-regex"
            active={service.options().regex}
            onClick={() => service.setOptions({ regex: !service.options().regex })}
            icon={<Regex size={14} />}
          />
          <ToggleButton
            label="Replace"
            testId="toggle-replace"
            active={replaceOpen()}
            onClick={() => setReplaceOpen((v) => !v)}
            icon={<Pencil size={14} />}
          />
          <div class="ml-auto flex items-center gap-1">
            <Show when={service.state.status === "running"}>
              <span class="text-[10px] uppercase tracking-wider text-[var(--accent)]">
                searching…
              </span>
            </Show>
            <Show when={service.state.status === "cancelled"}>
              <span class="text-[10px] uppercase tracking-wider text-[var(--dim)]">
                cancelled
              </span>
            </Show>
          </div>
        </div>

        <div class="flex gap-2">
          <FilterInput
            testId="search-include"
            label="files to include"
            placeholder="src/**, packages/*/src/**"
            value={service.options().include}
            onInput={(v) => service.setOptions({ include: v })}
          />
          <FilterInput
            testId="search-exclude"
            label="files to exclude"
            placeholder="**/*.test.ts, node_modules/**"
            value={service.options().exclude}
            onInput={(v) => service.setOptions({ exclude: v })}
          />
        </div>

        <Show when={replaceOpen() && service.state.fileOrder.length > 0}>
          <button
            type="button"
            data-testid="replace-across-files"
            class="self-end rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--bg)] hover:opacity-90"
            disabled={service.replaceWith().length === 0}
            onClick={() => setConfirmAcrossFiles(true)}
          >
            Replace {totalMatchesAcrossFiles()} in {service.state.fileOrder.length} files
          </button>
        </Show>
      </div>

      <Show when={service.state.summary}>
        {(summary) => (
          <div
            data-testid="search-summary"
            class="border-b border-[var(--border)] px-3 py-1 text-[11px] text-[var(--dim)]"
          >
            <span data-testid="summary-matches">{summary().matches}</span> results in
            <span class="mx-1" data-testid="summary-files">
              {totals().fileCount}
            </span>
            files · <span data-testid="summary-elapsed">{summary().elapsedMs}ms</span>
            <Show when={summary().truncated}>
              <span class="ml-2 rounded bg-[var(--bg-strong)] px-1 py-0.5 text-[10px] uppercase text-[var(--accent)]">
                truncated
              </span>
            </Show>
          </div>
        )}
      </Show>

      <Show when={service.state.error}>
        <div
          data-testid="search-error"
          class="border-b border-[var(--red)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--red)]"
        >
          {service.state.error}
        </div>
      </Show>

      <Show when={pendingReplace()}>
        {(result) => (
          <div
            data-testid="replace-summary"
            class="border-b border-[var(--green)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--green)]"
          >
            Replaced {result().matchesReplaced} matches in {result().filesUpdated} files
            <Show when={result().skipped.length > 0}>
              <span class="ml-2 text-[var(--dim)]">
                {result().skipped.length} skipped (
                {result().skipped[0]?.reason ?? "unknown"}
                {result().skipped.length > 1 ? ", …" : ""})
              </span>
            </Show>
          </div>
        )}
      </Show>

      <Show when={replaceError()}>
        <div
          data-testid="replace-error"
          class="border-b border-[var(--red)] bg-[var(--bg-strong)] px-3 py-1 text-[11px] text-[var(--red)]"
        >
          {replaceError()}
        </div>
      </Show>

      <div data-testid="search-results" class="min-h-0 flex-1 overflow-auto">
        <For each={service.state.fileOrder}>
          {(path) => (
            <Show when={service.state.byFile[path]}>
              {(file) => (
                <FileGroup
                  file={file()}
                  onToggle={() => service.toggleFile(path)}
                  onOpenMatch={(line) => openFile(path, line)}
                  replaceVisible={replaceOpen()}
                  replaceDisabled={service.replaceWith().length === 0}
                  onReplaceFile={() => void replacePaths([path])}
                />
              )}
            </Show>
          )}
        </For>
        <Show
          when={
            service.state.status === "done" &&
            service.state.fileOrder.length === 0 &&
            service.query().trim().length > 0
          }
        >
          <div
            data-testid="search-empty"
            class="flex h-full items-center justify-center text-[12px] text-[var(--dim)]"
          >
            No matches
          </div>
        </Show>
      </div>

      <Show when={confirmAcrossFiles()}>
        <ConfirmReplaceDialog
          totalMatches={totalMatchesAcrossFiles()}
          fileCount={service.state.fileOrder.length}
          onCancel={() => setConfirmAcrossFiles(false)}
          onConfirm={replaceAllConfirmed}
        />
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------
// File group
// ---------------------------------------------------------------------

interface FileGroupProps {
  file: FileMatch;
  onToggle: () => void;
  onOpenMatch: (line: number) => void;
  replaceVisible: boolean;
  replaceDisabled: boolean;
  onReplaceFile: () => void;
}

function FileGroup(props: FileGroupProps): JSX.Element {
  const matchCount = createMemo(() =>
    props.file.matches.reduce((sum, m) => sum + m.submatches.length, 0),
  );
  const contextLinesForMatch = (matchLine: number, contextWindow: number): number[] => {
    const lines: number[] = [];
    const ctx = props.file.contextByLine;
    for (let l = matchLine - contextWindow; l < matchLine; l += 1) {
      if (l in ctx) lines.push(l);
    }
    for (let l = matchLine + 1; l <= matchLine + contextWindow; l += 1) {
      if (l in ctx) lines.push(l);
    }
    return lines;
  };

  return (
    <div
      data-testid="search-file-group"
      data-path={props.file.path}
      class="border-b border-[var(--border-weak,var(--border))]"
    >
      <div class="group flex w-full items-center gap-1 bg-[var(--bg-weak)] px-2 py-1 text-[11px] text-[var(--fg-secondary)]">
        <button
          type="button"
          data-testid="search-file-toggle"
          onClick={() => props.onToggle()}
          class="flex flex-1 items-center gap-1 text-left hover:text-[var(--fg)]"
        >
          {props.file.expanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          <span class="truncate font-mono">{props.file.path}</span>
          <span class="ml-1 text-[10px] text-[var(--dim)]">
            ({matchCount()} {matchCount() === 1 ? "match" : "matches"})
          </span>
        </button>
        <Show when={props.replaceVisible}>
          <button
            type="button"
            data-testid="search-file-replace"
            disabled={props.replaceDisabled}
            onClick={(e) => {
              e.stopPropagation();
              props.onReplaceFile();
            }}
            class="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--surface-hover,var(--bg-strong))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Replace
          </button>
        </Show>
      </div>
      <Show when={props.file.expanded}>
        <div class="bg-[var(--bg)] font-mono text-[12px] leading-relaxed">
          <For each={props.file.matches}>
            {(match) => (
              <>
                <For each={contextLinesForMatch(match.line, 3)}>
                  {(ctxLine) => (
                    <Show when={ctxLine < match.line}>
                      <button
                        type="button"
                        class="block w-full px-3 py-0.5 text-left text-[var(--dim)] hover:bg-[var(--surface-hover,var(--bg-strong))]"
                        onClick={() => props.onOpenMatch(ctxLine)}
                      >
                        <span class="mr-3 inline-block w-8 text-right tabular-nums">
                          {ctxLine}
                        </span>
                        <span>{props.file.contextByLine[ctxLine]}</span>
                      </button>
                    </Show>
                  )}
                </For>
                <button
                  type="button"
                  data-testid="search-match-row"
                  data-line={match.line}
                  class="block w-full px-3 py-0.5 text-left hover:bg-[var(--surface-hover,var(--bg-strong))]"
                  onClick={() => props.onOpenMatch(match.line)}
                >
                  <span class="mr-3 inline-block w-8 text-right tabular-nums text-[var(--dim)]">
                    {match.line}
                  </span>
                  <For each={segmentLine(match.text, match.submatches)}>
                    {(seg) =>
                      seg.kind === "match" ? (
                        <mark
                          data-testid="search-match-highlight"
                          class="rounded bg-[color-mix(in_oklab,var(--accent)_25%,transparent)] px-0.5 text-[var(--fg)]"
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span>{seg.text}</span>
                      )
                    }
                  </For>
                </button>
                <For each={contextLinesForMatch(match.line, 3)}>
                  {(ctxLine) => (
                    <Show when={ctxLine > match.line}>
                      <button
                        type="button"
                        class="block w-full px-3 py-0.5 text-left text-[var(--dim)] hover:bg-[var(--surface-hover,var(--bg-strong))]"
                        onClick={() => props.onOpenMatch(ctxLine)}
                      >
                        <span class="mr-3 inline-block w-8 text-right tabular-nums">
                          {ctxLine}
                        </span>
                        <span>{props.file.contextByLine[ctxLine]}</span>
                      </button>
                    </Show>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

interface ToggleButtonProps {
  label: string;
  testId: string;
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
}

function ToggleButton(props: ToggleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-pressed={props.active}
      title={props.label}
      onClick={() => props.onClick()}
      class={`flex h-6 w-6 items-center justify-center rounded text-[var(--fg-secondary)] hover:bg-[var(--surface-hover,var(--bg-strong))] ${
        props.active
          ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent)]"
          : ""
      }`}
    >
      {props.icon}
    </button>
  );
}

interface FilterInputProps {
  testId: string;
  label: string;
  placeholder: string;
  value: string;
  onInput: (next: string) => void;
}

function FilterInput(props: FilterInputProps): JSX.Element {
  return (
    <label class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-[10px] uppercase tracking-wider text-[var(--dim)]">{props.label}</span>
      <input
        data-testid={props.testId}
        value={props.value}
        onInput={(event) => props.onInput((event.currentTarget as HTMLInputElement).value)}
        placeholder={props.placeholder}
        class="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
        spellcheck={false}
        autocomplete="off"
      />
    </label>
  );
}

// ---------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------

interface ConfirmReplaceDialogProps {
  totalMatches: number;
  fileCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmReplaceDialog(props: ConfirmReplaceDialogProps): JSX.Element {
  let primaryRef: HTMLButtonElement | undefined;
  onMount(() => primaryRef?.focus());

  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    }
  }

  return (
    <div
      data-testid="confirm-replace-dialog"
      class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onKeyDown={onKey}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-replace-title"
        class="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl"
      >
        <h2
          id="confirm-replace-title"
          class="m-0 text-[14px] font-semibold leading-tight text-[var(--fg)]"
        >
          Replace across files
        </h2>
        <p class="mt-2 text-[12px] text-[var(--fg-secondary)]">
          About to replace <span class="font-mono">{props.totalMatches}</span> matches across{" "}
          <span class="font-mono">{props.fileCount}</span> files. This is destructive — commit
          your working tree first if you want easy revert (a non-committed file can still be
          restored via <code class="font-mono">git checkout -- .</code> if you don't reload).
        </p>
        <p class="mt-1 text-[12px] text-[var(--fg-secondary)]">
          Files modified since the last search snapshot will be skipped.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="confirm-replace-cancel"
            onClick={() => props.onCancel()}
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[12px] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            ref={primaryRef}
            type="button"
            data-testid="confirm-replace-confirm"
            onClick={() => props.onConfirm()}
            class="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-[var(--bg)] hover:opacity-90"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
