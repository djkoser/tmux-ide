import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import type { ChangedFile } from "../lib/changedFiles";

interface DirectoryGroup {
  dir: string;
  files: ChangedFile[];
}

export function ChangedFilesTree(props: { files: Accessor<ChangedFile[]> }) {
  const [open, setOpen] = createSignal(true);
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const groups = createMemo(() => groupFiles(props.files()));
  const writeCount = createMemo(() => props.files().filter((file) => file.kind === "write").length);
  const readCount = createMemo(() => props.files().filter((file) => file.kind === "read").length);

  function togglePath(path: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <Show when={props.files().length > 0}>
      <section class="sticky top-0 z-10 rounded-md border border-border-weak bg-bg/95 p-2 shadow-sm backdrop-blur">
        <button
          type="button"
          class="flex w-full items-center justify-between border-0 bg-transparent p-0 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <span class="text-[12px] font-medium text-fg">Changed files</span>
          <span class="text-[11px] text-dim">
            {writeCount()} written
            <Show when={readCount() > 0}> - {readCount()} read</Show> {open() ? "v" : ">"}
          </span>
        </button>

        <Show when={open()}>
          <div class="mt-2 max-h-72 overflow-auto">
            <For each={groups()}>
              {(group) => (
                <div class="mb-1 last:mb-0">
                  <Show when={group.dir}>
                    <div class="px-1 py-0.5 text-[11px] text-dim">{group.dir}/</div>
                  </Show>
                  <For each={group.files}>
                    {(file) => (
                      <div>
                        <button
                          type="button"
                          class={`flex w-full items-center justify-between rounded border-0 bg-transparent px-2 py-1 text-left text-[12px] hover:bg-surface-hover ${
                            file.kind === "read" ? "text-dim" : "text-fg-secondary"
                          }`}
                          onClick={() => togglePath(file.path)}
                        >
                          <span class="min-w-0 truncate">{basename(file.path)}</span>
                          <span class="ml-2 flex-shrink-0 text-[11px]">
                            <Show
                              when={file.kind === "write"}
                              fallback={<span class="text-dim">read</span>}
                            >
                              <DiffStat
                                additions={file.totalAdditions}
                                deletions={file.totalDeletions}
                              />
                            </Show>
                          </span>
                        </button>
                        <Show when={expanded().has(file.path)}>
                          <div class="mb-2 rounded-md border border-border-weak bg-surface">
                            <Show
                              when={file.edits.length > 0}
                              fallback={
                                <div class="p-2 text-[12px] text-dim">
                                  No diff content captured.
                                </div>
                              }
                            >
                              <For each={file.edits}>
                                {(edit, index) => (
                                  <div class="border-b border-border-weak last:border-b-0">
                                    <div class="px-2 py-1 text-[11px] text-dim">
                                      {edit.toolCallId} - {edit.createdAt}
                                    </div>
                                    <pre class="m-0 overflow-auto whitespace-pre-wrap px-2 pb-2 text-[11px] leading-relaxed text-fg-secondary">
                                      {formatDiff(edit.oldText, edit.newText)}
                                    </pre>
                                    <Show when={index() < file.edits.length - 1}>
                                      <div class="mx-2 border-t border-border-weak" />
                                    </Show>
                                  </div>
                                )}
                              </For>
                            </Show>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  );
}

function DiffStat(props: { additions: number; deletions: number }) {
  return (
    <>
      <Show when={props.additions > 0}>
        <span class="text-green">+{props.additions}</span>
      </Show>
      <Show when={props.additions > 0 && props.deletions > 0}> </Show>
      <Show when={props.deletions > 0}>
        <span class="text-red">-{props.deletions}</span>
      </Show>
      <Show when={props.additions === 0 && props.deletions === 0}>
        <span class="text-dim">changed</span>
      </Show>
    </>
  );
}

function groupFiles(files: ChangedFile[]): DirectoryGroup[] {
  const groups = new Map<string, ChangedFile[]>();
  for (const file of files) {
    const dir = dirname(file.path);
    groups.set(dir, [...(groups.get(dir) ?? []), file]);
  }
  return [...groups.entries()].map(([dir, groupFiles]) => ({ dir, files: groupFiles }));
}

function dirname(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function formatDiff(oldText: string, newText: string): string {
  if (!oldText) return prefixLines(newText, "+");
  if (!newText) return prefixLines(oldText, "-");
  return [`--- before`, prefixLines(oldText, "-"), `+++ after`, prefixLines(newText, "+")].join(
    "\n",
  );
}

function prefixLines(text: string, prefix: string): string {
  if (!text) return `${prefix}`;
  return text
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
