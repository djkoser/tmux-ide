"use client";

import { useCallback, useMemo } from "react";
import { Terminal } from "@/components/Terminal";
import { TerminalHeader } from "@/components/ContextBar";
import { closeTab, useNavigation, type Tab } from "@/lib/navigation";

/**
 * TerminalsHost — owns the lifecycle of every terminal tab in the
 * shell. Mounted at the AppShell level so terminal `<Terminal>`
 * instances persist even when a non-terminal tab is active. State
 * survives tab switches because we never unmount: only `display: none`
 * flips for inactive terminals, and the host as a whole hides when no
 * terminal tab is active.
 *
 * Lifecycle contract:
 *
 *  - Every `Tab` of `kind === "terminal"` mounts exactly one
 *    `<Terminal>`. Its xterm + WebSocket boot once and stay alive
 *    until the tab is closed.
 *  - Switching tabs flips `display: flex` / `display: none` on each
 *    terminal slot — no unmount.
 *  - Closing a terminal tab removes it from `openTabs`, which
 *    unmounts its `<Terminal>` and tears down the WebSocket.
 *  - When the active tab is not a terminal kind, the entire host
 *    hides via `display: none`. Every `<Terminal>` keeps running in
 *    the background.
 */
export function TerminalsHost() {
  const { openTabs, activeTabId } = useNavigation();

  const terminalTabs = useMemo(
    () =>
      openTabs.filter((tab): tab is Extract<Tab, { kind: "terminal" }> => tab.kind === "terminal"),
    [openTabs],
  );

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeIsTerminal = activeTab?.kind === "terminal";
  const activeTerminal = activeIsTerminal ? activeTab : null;

  // Intentionally a no-op: do NOT auto-close the tab when the shell
  // exits. The Terminal component already prints "[session ended: N]"
  // into the xterm buffer, and that message — plus the user's option to
  // close via the tab's X button — is the right UX. Auto-closing made
  // the terminal flash up and disappear whenever the wrapped command
  // (e.g. tmux-ide spawning a session that fast-exited because no
  // ide.yml existed) terminated immediately on launch.
  const handleSessionExit = useCallback((_id: string) => {
    void _id;
    void closeTab; // Kept imported for future "Close on exit" setting.
  }, []);

  if (terminalTabs.length === 0) return null;

  return (
    <section
      data-testid="terminals-host"
      data-active={activeIsTerminal ? "true" : "false"}
      data-active-terminal={activeTerminal?.id}
      className="absolute inset-0 z-10 flex-col bg-[var(--term-bg)]"
      style={{ display: activeIsTerminal ? "flex" : "none" }}
      aria-hidden={!activeIsTerminal}
      aria-label="Terminal panel"
    >
      <TerminalHeader
        sessionName={activeTerminal?.sessionName ?? null}
        title={activeTerminal?.title ?? null}
        cwd={activeTerminal?.cwd ?? null}
      />
      <div className="relative min-h-0 flex-1">
        {terminalTabs.map((tab) => {
          const visible = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-terminal-slot={tab.id}
              data-active={visible || undefined}
              className="absolute inset-0 flex flex-col"
              style={{ display: visible ? "flex" : "none" }}
            >
              <Terminal
                id={tab.id}
                showHeader={false}
                cwd={tab.cwd}
                cmd={tab.cmd}
                onSessionExit={handleSessionExit}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
