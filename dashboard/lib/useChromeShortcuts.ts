"use client";

/**
 * useChromeShortcuts — install the VSCode-style chrome keybinds for the
 * three secondary regions (primary sidebar, secondary sidebar, panel).
 *
 * Bindings (Cmd on macOS, Ctrl on Linux/Windows — `metaKey` covers both
 * in practice because we read `metaKey || ctrlKey`):
 *   - Cmd+B       toggleLeftSidebar
 *   - Cmd+Alt+B   toggleRightInspector
 *   - Cmd+J       toggleBottomPanel
 *
 * Order of checks matters: `Cmd+Alt+B` must be handled before plain
 * `Cmd+B` because the latter would otherwise consume it.
 *
 * Skips the handler when focus is in a text input / textarea /
 * contenteditable so users typing "j" or "b" don't accidentally collapse
 * panels. The command palette + chat composer both rely on this guard.
 */

import { useEffect } from "react";
import {
  toggleBottomPanel,
  toggleLeftSidebar,
  toggleRightInspector,
} from "./useChromeLayout";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useChromeShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "b" && event.key !== "B" && event.key !== "j" && event.key !== "J") {
        return;
      }
      if (isEditableTarget(event.target)) return;

      // Cmd+Alt+B → toggle secondary sidebar (right inspector). Must be
      // checked first because plain Cmd+B would also match.
      if (event.altKey && (event.key === "b" || event.key === "B")) {
        event.preventDefault();
        toggleRightInspector();
        return;
      }
      if (event.altKey) return; // any other Cmd+Alt+X is not ours

      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        toggleLeftSidebar();
        return;
      }
      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        toggleBottomPanel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
