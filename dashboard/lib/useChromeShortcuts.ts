"use client";

/**
 * useChromeShortcuts — install the VSCode-style chrome keybinds for the
 * three secondary regions (primary sidebar, secondary sidebar, panel).
 *

 * Bindings (Cmd on macOS, Ctrl on Linux/Windows — `metaKey` covers both
 * in practice because we read `metaKey || ctrlKey`):
 *   - Cmd+B       toggleLeftSidebar
 *   - Cmd+Alt+B   toggleRightInspector (VSCode default)
 *   - Cmd+I       toggleRightInspector (mnemonic alias — "Inspector")
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
      const key = event.key;
      const isB = key === "b" || key === "B";
      const isJ = key === "j" || key === "J";
      const isI = key === "i" || key === "I";
      if (!isB && !isJ && !isI) return;
      if (isEditableTarget(event.target)) return;

      // Cmd+Alt+B → toggle secondary sidebar (right inspector). Must be
      // checked first because plain Cmd+B would also match.
      if (event.altKey && isB) {
        event.preventDefault();
        toggleRightInspector();
        return;
      }
      if (event.altKey) return; // any other Cmd+Alt+X is not ours

      if (isB) {
        event.preventDefault();
        toggleLeftSidebar();
        return;
      }
      if (isJ) {
        event.preventDefault();
        toggleBottomPanel();
        return;
      }
      if (isI) {
        // Cmd+I mnemonic — "Inspector". Aliases the chrome layout's
        // right-inspector toggle so the Inspector widget's controlled
        // `expanded` prop flips in lockstep with the outer panel.
        event.preventDefault();
        toggleRightInspector();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
