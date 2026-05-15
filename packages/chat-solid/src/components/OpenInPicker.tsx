/**
 * Header dropdown that opens the current thread's project dir in an
 * external editor (Cursor / Trae / Kiro / VS Code / VS Code Insiders /
 * VSCodium / Zed / Antigravity / IntelliJ IDEA / file manager).
 *
 * Split-button layout matches the upstream surface: the primary
 * action launches the user's preferred editor; the chevron opens a
 * menu of every detected editor so the user can switch. Picking a
 * non-preferred entry both opens it AND persists it as the new
 * preferred default (host-owned — fires `onPreferredEditorChange`).
 *
 * The host owns:
 *   - editor detection (`availableEditors`)
 *   - the shell call (`onOpenInEditor`)
 *   - preference persistence (`onPreferredEditorChange`)
 *   - shortcut binding (optional `favoriteShortcutLabel` — when set,
 *     renders next to the preferred row as a hint chip)
 *
 * Component is pure render — every interaction routes through the
 * supplied callbacks so chat-solid stays out of the
 * shell-API / preference-store / keybinding territories.
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";

export type EditorId =
  | "cursor"
  | "trae"
  | "kiro"
  | "vscode"
  | "vscode-insiders"
  | "vscodium"
  | "zed"
  | "antigravity"
  | "idea"
  | "file-manager";

interface EditorMeta {
  id: EditorId;
  label: string;
  /** Single-char glyph rendered when no icon URL is supplied. */
  glyph: string;
}

const EDITOR_REGISTRY: ReadonlyArray<EditorMeta> = [
  { id: "cursor", label: "Cursor", glyph: "✦" },
  { id: "trae", label: "Trae", glyph: "T" },
  { id: "kiro", label: "Kiro", glyph: "K" },
  { id: "vscode", label: "VS Code", glyph: "⌁" },
  { id: "vscode-insiders", label: "VS Code Insiders", glyph: "⌁" },
  { id: "vscodium", label: "VSCodium", glyph: "⌁" },
  { id: "zed", label: "Zed", glyph: "Z" },
  { id: "antigravity", label: "Antigravity", glyph: "A" },
  { id: "idea", label: "IntelliJ IDEA", glyph: "I" },
  { id: "file-manager", label: "File manager", glyph: "🗂" },
];

const EDITOR_BY_ID: ReadonlyMap<EditorId, EditorMeta> = new Map(
  EDITOR_REGISTRY.map((entry) => [entry.id, entry]),
);

export interface OpenInPickerProps {
  /** Detected editors, in the order the host wants to surface them. */
  availableEditors: Accessor<ReadonlyArray<EditorId>>;
  /** Currently-preferred editor; null until the user picks one. */
  preferredEditor: Accessor<EditorId | null>;
  /** Project directory to pass to the shell call. */
  openInCwd: Accessor<string | null>;
  /** Host wires this to the shell `openInEditor` API. */
  onOpenInEditor: (editorId: EditorId, cwd: string) => void;
  /** Persisted by the host (composer preferences / user settings). */
  onPreferredEditorChange: (editorId: EditorId) => void;
  /** Optional shortcut label rendered next to the preferred row. */
  favoriteShortcutLabel?: Accessor<string | null>;
  /** Optional accessor for the active label override (e.g. "Finder"). */
  primaryLabel?: Accessor<string | null>;
}

const TRIGGER_PRIMARY_CLASS =
  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-l-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

const TRIGGER_CHEVRON_CLASS =
  "inline-flex h-7 cursor-pointer items-center justify-center rounded-r-md border border-l-0 border-[var(--border)] bg-[var(--surface)] px-1.5 text-[11px] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

const POPUP_CLASS =
  "absolute right-0 top-[calc(100%+0.25rem)] z-30 min-w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-elevated,var(--bg-strong))] shadow-2xl";

const ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-[12px] text-[var(--fg)] hover:bg-[var(--surface-hover,var(--surface))]";

function metaFor(id: EditorId | null): EditorMeta | null {
  if (!id) return null;
  return EDITOR_BY_ID.get(id) ?? null;
}

export function OpenInPicker(props: OpenInPickerProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [chevron, setChevron] = createSignal<HTMLButtonElement>();
  const [popup, setPopup] = createSignal<HTMLDivElement>();

  const options = createMemo<ReadonlyArray<EditorMeta>>(() =>
    EDITOR_REGISTRY.filter((entry) => props.availableEditors().includes(entry.id)),
  );

  const primaryMeta = createMemo<EditorMeta | null>(() => {
    const explicit = metaFor(props.preferredEditor());
    if (explicit && options().some((o) => o.id === explicit.id)) return explicit;
    return options()[0] ?? null;
  });

  const disabled = (): boolean => !primaryMeta() || !props.openInCwd();

  function close(): void {
    setOpen(false);
  }

  function toggle(): void {
    setOpen((value) => !value);
  }

  function dispatchOpen(editor: EditorId): void {
    const cwd = props.openInCwd();
    if (!cwd) return;
    props.onOpenInEditor(editor, cwd);
    props.onPreferredEditorChange(editor);
  }

  function onDocPointer(event: PointerEvent): void {
    const chevronEl = chevron();
    const popupEl = popup();
    if (event.target instanceof Node) {
      if (popupEl?.contains(event.target)) return;
      if (chevronEl?.parentElement?.contains(event.target)) return;
    }
    close();
  }

  function onDocKey(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }

  createEffect(
    on(open, (isOpen) => {
      if (!isOpen) return;
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onDocKey);
      onCleanup(() => {
        document.removeEventListener("pointerdown", onDocPointer);
        document.removeEventListener("keydown", onDocKey);
      });
    }),
  );

  return (
    <div data-testid="open-in-picker" class="relative inline-flex">
      <button
        type="button"
        data-testid="open-in-picker-primary"
        data-editor-id={primaryMeta()?.id ?? ""}
        disabled={disabled()}
        onClick={() => {
          const target = primaryMeta();
          if (!target) return;
          dispatchOpen(target.id);
        }}
        class={TRIGGER_PRIMARY_CLASS}
        title={primaryMeta() ? `Open in ${primaryMeta()!.label}` : "No editor detected"}
      >
        <span aria-hidden="true" class="text-[12px]">
          {primaryMeta()?.glyph ?? "·"}
        </span>
        <span class="hidden sm:inline">
          {props.primaryLabel?.() ?? primaryMeta()?.label ?? "Open"}
        </span>
      </button>
      <button
        ref={setChevron}
        type="button"
        data-testid="open-in-picker-chevron"
        data-open={open() ? "true" : "false"}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label="Choose editor"
        onClick={toggle}
        class={TRIGGER_CHEVRON_CLASS}
      >
        <span aria-hidden="true" class="text-[9px]">
          ▾
        </span>
      </button>
      <Show when={open()}>
        <div ref={setPopup} data-testid="open-in-picker-menu" role="menu" class={POPUP_CLASS}>
          <Show
            when={options().length > 0}
            fallback={
              <div
                data-testid="open-in-picker-empty"
                class="px-3 py-3 text-center text-[12px] text-[var(--dim)]"
              >
                No installed editors found
              </div>
            }
          >
            <For each={options()}>
              {(entry) => (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="open-in-picker-option"
                  data-editor-id={entry.id}
                  data-preferred={entry.id === props.preferredEditor() ? "true" : "false"}
                  class={ROW_CLASS}
                  onClick={() => {
                    dispatchOpen(entry.id);
                    close();
                  }}
                >
                  <span aria-hidden="true" class="w-4 text-center text-[var(--fg-secondary)]">
                    {entry.glyph}
                  </span>
                  <span class="flex-1">{entry.label}</span>
                  <Show
                    when={entry.id === props.preferredEditor() && props.favoriteShortcutLabel?.()}
                  >
                    {(label) => (
                      <kbd
                        data-testid="open-in-picker-shortcut"
                        class="h-4 rounded-sm border border-[var(--border-weak,var(--border))] px-1 text-[10px] text-[var(--fg-secondary)]"
                      >
                        {label()}
                      </kbd>
                    )}
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
