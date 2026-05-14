/**
 * Per-file icon renderer that tries a Material/VSCode-style icon
 * URL first and falls back to a generic glyph if the image fails
 * to load. Used by the `OpenInPicker` row + any future file-aware
 * markdown surface that wants the same "real icon, no
 * lucide-substitute" treatment.
 *
 * The icon lookup itself is left to the host — pass `iconUrl` in
 * (typically built from `vscode-icons` shipped via your asset
 * pipeline). The component owns the failure cache so a bad URL
 * never re-fetches.
 *
 * Tiny static initials helper exposed alongside so the host can
 * compute the fallback label deterministically (used in the menu
 * row).
 */

import { createSignal, Show, type JSX } from "solid-js";

export interface VscodeEntryIconProps {
  pathValue: string;
  kind: "file" | "directory";
  /**
   * Pre-resolved icon URL. When omitted (or the load fails), the
   * generic glyph fallback renders instead.
   */
  iconUrl?: string;
  class?: string;
  /** Optional aria-label; defaults to the basename of `pathValue`. */
  alt?: string;
}

const FILE_GLYPH = "📄";
const FOLDER_GLYPH = "📁";

export function basename(pathValue: string): string {
  const trimmed = pathValue.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function VscodeEntryIcon(props: VscodeEntryIconProps): JSX.Element {
  const [failed, setFailed] = createSignal(false);

  const shouldShowFallback = (): boolean => !props.iconUrl || failed();

  return (
    <span
      data-testid="vscode-entry-icon"
      data-kind={props.kind}
      data-path={props.pathValue}
      data-failed={failed() ? "true" : "false"}
      class={`inline-flex size-4 shrink-0 items-center justify-center ${props.class ?? ""}`}
      aria-label={props.alt ?? basename(props.pathValue)}
    >
      <Show
        when={!shouldShowFallback()}
        fallback={
          <span class="text-[14px] leading-none text-[var(--fg-muted,var(--fg-secondary))]" aria-hidden="true">
            {props.kind === "directory" ? FOLDER_GLYPH : FILE_GLYPH}
          </span>
        }
      >
        <img
          src={props.iconUrl}
          alt=""
          aria-hidden="true"
          class="size-4 shrink-0"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </Show>
    </span>
  );
}
