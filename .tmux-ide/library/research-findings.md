# Research findings — Widgets web port survey (G1 / Task 004)

Survey of `src/widgets/*` to inform the migration onto `/v2`. For each
widget the table records (a) input data shape, (b) render output, (c)
external dependencies, and (d) the recommended port path: **native
React port** (rebuild with TUI-component-library primitives + Next.js
+ command-center API) or **PTY-in-xterm mirror** (run the existing
OpenTUI binary in a server-side PTY and stream to xterm.js).

## Per-widget findings

| Widget | Input data | Render output | External deps | Port recommendation | Reason |
|--------|------------|---------------|----------------|---------------------|--------|
| **changes** | `git status` / `git diff --cached` / `--numstat` / `ls-files`; file watchers; `@preview_file` tmux session var | Interactive — j/k nav, `s`/`u` stage/unstage, `c` view file, `r` refresh, diff preview | `execFileSync` (git); `@parcel/watcher`; tmux CLI for pane comms | **Native React port** | Git status is data-driven; stage/unstage are simple mutations; watcher + git move cleanly to Next.js API routes + SSE for client updates. |
| **config** | `ide.yml` load/write; config tree model; field-type inference | Interactive — Tab nav, Ctrl+S save, Enter to edit fields, Ctrl+R restart tmux session | YAML I/O (`readConfig`/`writeConfig`); `execFileSync` (tmux restart); child-process for `tmux-ide restart` | **Native React port** | Config editing is a form UI; rebuilds with shadcn forms + Next.js API. tmux restart becomes an async endpoint. |
| **costs** | Polls `loadAccounting(dir)` from `token-tracker.json` every 5s; session elapsed time | Read-only — j/k nav, `r` refresh, displays agent/task metrics | File I/O (`loadAccounting`); polling via `setInterval` | **Native React port** | Purely display-driven; polling becomes a SWR hook. No external processes or watchers. |
| **explorer** | Directory tree via `readdirSync`; git status map; `.gitignore` filter; file watchers; tmux session options; branch via `git rev-parse` | Interactive — j/k nav, `/` search, `l`/`h` traverse, `[`/`]` jump-to-changed, `c` read, `o` editor, `H`/`I` toggles, `r` refresh | `readdirSync`/`existsSync`/`statSync`; `@parcel/watcher` (dir + git HEAD); `ignore` (gitignore parser); git CLI; tmux CLI for session options | **PTY-in-xterm mirror** | Dual filesystem watchers (working dir + `.git/HEAD`) with parsed gitignore rules; tree expansion state tightly coupled to watchers; tmux session-var persistence. Rebuilding all of that natively is more work than streaming the existing TUI. |
| **mission-control** | Loads mission/goals/tasks/events from files; lists panes via tmux; validates state; polls every 2s | Interactive — Tab switching (1-4), j/k nav, `a` add agent, `/` command mode (create task, send cmd, add agent), Enter focus pane | `loadMission`/`loadGoals`/`loadTasks` (file I/O); event log; `listSessionPanes` (tmux CLI); `execFileSync` (tmux split-window, send-keys, select-pane); polling | **PTY-in-xterm mirror** | Heavy tmux mutation: spawning panes, sending keys, managing agents, introspecting pane state. The command palette spawns child processes. Web port would require a tmux-daemon sidecar — PTY streaming is the simpler path. |
| **preview** | Polls `@preview_file` tmux session var; `readFileSync`; `git diff`; syntax-color hints | Read-only with `d` toggle (content vs diff); gutter markers for git changes; syntax coloring heuristic | `readFileSync`/`statSync`/`existsSync`; git diff; polling tmux option via `execFileSync` | **Native React port** | Read-only + data-driven; git diff computed on demand. Polling tmux session var becomes a context provider; file reads move to a Next.js API. |
| **setup** | `detectStack()`; load/write `ide.yml`; multi-panel wizard (detect → layout → naming → review) | Interactive — Tab nav, field editing, save/launch flow; sub-components: `DetectPanel`, `LayoutPicker`, `AgentNaming`, `ConfigTree`, `FieldEditor` | File I/O (config read/write); `execFileSync` (tmux-ide launch); stack detection (reads `package.json`, `tsconfig`, etc.) | **Native React port** | Linear wizard with conditional panels. Stack detection + config I/O are straightforward API calls. No watchers; tmux-ide launch becomes an async endpoint. |
| **tasks** | Loads from `.tasks/` dir; file watcher on task directory; `task-model.ts` for CRUD | Interactive — list → detail → form views; create/edit/delete tasks; dependency tracking | File I/O (`loadTasks`/`ensureTasksDir`); `@parcel/watcher`; child views (`TaskList`, `TaskDetail`, `TaskForm`) | **Native React port** | CRUD over file-backed state. Watcher becomes a polling hook. Form editing is standard React. No tmux integration or process spawning. |

## Cross-cutting observations

**Shared infra all widgets touch.** Every widget uses
`lib/theme.ts` (OpenTUI RGBA tokens — translate to Tailwind/shadcn
tokens), receives `--session`/`--dir`/`--target`/`--theme` CLI args
(translate to Next.js route params + auth context), and goes through
`lib/pane-comms.ts` for tmux RPC (translate to authenticated calls to
the command-center HTTP/SSE/WS bridge). File watchers use
`@parcel/watcher` and translate to TanStack Query / SWR polling.

**Native React port (6/8): `changes`, `config`, `costs`, `preview`,
`setup`, `tasks`.** Common shape — data is fetched once or polled
(not streamed off a persistent watcher), UI is form/table-like, no
OS-process spawning inside the widget, no tmux mutations beyond
reading session state. Rebuild with Next.js App Router + the new TUI
component library primitives + TanStack Query. Mutations land on
command-center API routes.

**PTY-in-xterm mirror (2/8): `explorer`, `mission-control`.** Common
shape — multiple persistent file watchers with parsed rules, UI state
that's coupled to those watchers, and/or heavy tmux mutation
(split-window, send-keys, select-pane). Rebuilding loses the existing
TUI's tight integration; cheaper and lower-risk to PTY-stream the
already-working OpenTUI binary into xterm.js.

## Unblocks G2

This survey is the dependency for G2 task fan-out: per-widget port
tasks can now be created with the right approach assigned. Suggested
G2 split:

- **G2.A — Native React ports** (one task per widget): changes,
  config, costs, preview, setup, tasks
- **G2.B — PTY bridge infrastructure**: a single task to stand up the
  Node-side PTY server + xterm.js client wiring at `/v2/widget/[name]`
- **G2.C — PTY widget integrations**: one task each for explorer and
  mission-control once G2.B lands

## Open questions for Lead

1. Is there appetite to pre-rebuild `explorer`/`mission-control`
   natively long-term, with PTY as a stopgap? If so, mark G2.C as
   "phase 1" and add G3 tasks for native ports.
2. Are command-center endpoints already in place for all read paths
   (mission/goals/tasks/events/accounting)? If gaps exist, those
   become G2 prerequisites.
## 004: Survey src/widgets/* for web port: data shape + render contract
Type: widgets
Surveyed all 8 widgets in src/widgets/ (changes, config, costs, explorer, mission-control, preview, setup, tasks). Documented input data shape, render output (interactive vs read-only), external dependencies, and per-widget port recommendation in .tmux-ide/library/research-findings.md as a structured table plus cross-cutting observations. Recommend native React port for 6/8 (changes, config, costs, preview, setup, tasks) and PTY-in-xterm mirror for explorer and mission-control. Findings unlock G2 task fan-out — included a suggested G2.A/B/C split and 2 open questions for Lead.
---


# Research findings — @base-ui/react retire-candidates audit (Task 006)

`grep -rl '@base-ui/react'` across the dashboard returns **6 direct
import sites** in the dashboard source (excluding `node_modules` and
`.next`). The TUI library at `components/tui/` already ships
similarly-named components for every primitive in use; substitution
viability varies by primitive (see "Substitution complexity" column).

## Direct usages

| File | Base UI primitive | TUI candidate | Substitution complexity | Notes |
|------|-------------------|---------------|-------------------------|-------|
| `components/ui/button.tsx` | `Button` (`@base-ui/react/button`) | `components/tui/Button.tsx` | **Low** | TUI `Button` is a styled `<button>` with `theme: 'PRIMARY' | 'SECONDARY'` and `isDisabled`. Base UI's headless behavior (form integration, render-prop pattern) needs to be matched at the wrapper level — but for our usage (mostly visual styling), TUI Button is a clean drop-in. ~16 consumer files (`@/components/ui` re-export). |
| `components/ui/dialog.tsx` | `Dialog` (`@base-ui/react/dialog`) | `components/tui/Dialog.tsx` | **High** | TUI `Dialog` is a card with built-in OK/Cancel — **not a modal primitive**. No overlay, no focus-trap, no ESC-to-close, no portal, no `Dialog.Root`/`Trigger`/`Portal`/`Backdrop`/`Popup` slot composition. ~10 consumer files use the wrapper's slot API (`DialogContent`, `DialogTitle`, `DialogDescription`, etc.). To retire `@base-ui/react/dialog` we'd need to either (a) keep a headless layer (Base UI, Radix, or React Aria) or (b) hand-roll focus-trap + portal + scroll-lock + ESC handling. |
| `components/ui/separator.tsx` | `Separator` (`@base-ui/react/separator`) | `components/tui/Divider.tsx` | **Low** | TUI `Divider` is a presentational rule (no `role="separator"`). Easy swap for visual rules; ARIA semantics need to be re-added in the wrapper if a screen-reader-meaningful separator is required. ~4 consumer files. |
| `components/ui/tooltip.tsx` | `Tooltip` (`@base-ui/react/tooltip`) | `components/tui/Tooltip.tsx` | **High** | TUI `Tooltip` is a styled `<div>` — **no hover-intent state machine, no positioning, no portal**. Base UI handles delay groups, hover/focus triggers, escape, and viewport-aware positioning. ~5 consumer files use `<Tooltip><TooltipTrigger><TooltipContent>...` — that compositional API has no TUI counterpart. Same retire-options as Dialog. |
| `components/app-shell/ProjectSwitcher.tsx` | `Popover` (`@base-ui/react/popover`) | `components/tui/Popover.tsx` | **High** | Uses `Popover.Root` / `Trigger` / `Portal` / `Positioner` / `Popup` with `sideOffset`, `align`. TUI `Popover` is a styled `<div>` with no positioning, portal, or open-state handling. Direct substitution would lose all positioning behavior. |
| `components/status-bar/StatusPopover.tsx` | `Popover` (`@base-ui/react/popover`) | `components/tui/Popover.tsx` | **High** | Same shape as `ProjectSwitcher` — `sideOffset`, `side`, `align` positioning props all rely on Base UI's positioner. Two consumers total for `@base-ui/react/popover`. |

`@base-ui/react` is pinned at `^1.4.1` in `dashboard/package.json`. No
other direct imports.

## Transitive coupling

`components/ui/sidebar.tsx` (the shadcn-style sidebar — not a Base UI
direct user, but slated to retire per the Goal acceptance criteria)
depends on `Button`, `Dialog`, `Separator`, and `Tooltip` from
`components/ui/`, all of which currently import `@base-ui/react`.
Retiring `@base-ui/react` therefore unblocks — or is unblocked by —
the sidebar retirement to `tui/SidebarLayout` + `tui/Navigation`.
Order doesn't matter strictly, but doing **sidebar retirement first**
shrinks the consumer set for `Button`/`Dialog`/`Separator`/`Tooltip`,
which makes the `@base-ui/react` retirement cheaper.

## Path to dropping `@base-ui/react`

Two viable strategies:

**Strategy A — Substitute headless layer (recommended).** Retire
`@base-ui/react` by adopting a different headless library
(`@radix-ui/react-*` or `react-aria-components`) for Dialog, Tooltip,
and Popover, while retiring Button + Separator outright in favor of
TUI shells. Cost: one external dep traded for another, but Radix is
already a more common ecosystem choice. Effort: ~1 day per primitive,
plus consumer migration.

**Strategy B — Hand-roll headless behavior.** Keep TUI shells and
build the missing behavior (focus-trap, portal, positioner,
hover-intent) ourselves. Higher upfront cost, and easier to get a11y
wrong. Effort: ~2–3 days per primitive plus ongoing a11y maintenance.
Not recommended.

In either strategy, **Button** and **Separator** can be retired
immediately with low risk — they're presentational, the TUI shells
suffice, and the consumer surface is small enough to migrate in a
single PR per primitive.

## Suggested task split

- **G3.A — Retire `@base-ui/react/button`**: swap
  `components/ui/button.tsx` to wrap `tui/Button`; verify ~16
  consumers compile; visual regression sweep.
- **G3.B — Retire `@base-ui/react/separator`**: swap
  `components/ui/separator.tsx` to wrap `tui/Divider`; restore
  `role="separator"` in wrapper if needed; ~4 consumers.
- **G3.C — Sidebar retirement** (per Goal acceptance): move
  `components/ui/sidebar.tsx` consumers onto
  `tui/SidebarLayout` + `tui/Navigation`. Removes the largest cluster
  of indirect Base UI exposure.
- **G3.D — Pick headless strategy** for Dialog / Tooltip / Popover.
  Open question for Lead: Radix? React Aria? Hand-roll? This
  decision blocks G3.E/F/G.
- **G3.E/F/G — Migrate Dialog / Tooltip / Popover** behind whichever
  headless layer is chosen, then remove `@base-ui/react` from
  `package.json`.

## Open questions for Lead

1. Which headless strategy for Dialog/Tooltip/Popover — Radix, React
   Aria, or hand-roll? This is the gating decision for G3.D and
   downstream tasks.
2. Is the visual contract of `tui/Dialog` (built-in OK/Cancel,
   no overlay) acceptable for any of our 10 dialog sites, or do all
   need full-modal semantics? If some can downgrade to the simpler
   shell, fewer headless slots are needed.
## 006: Audit @base-ui/react usage and list retire-candidates
Type: cleanup
Audited @base-ui/react direct usage in dashboard: 6 import sites (button, dialog, separator, tooltip, plus Popover in ProjectSwitcher and StatusPopover). Appended structured findings to .tmux-ide/library/research-findings.md including per-file substitution-complexity rating against the corresponding components/tui/* candidate. Key finding: TUI shells for Dialog/Tooltip/Popover are presentational only — no headless behavior (focus-trap, portal, positioner, hover-intent), so retiring @base-ui/react requires either an alternative headless lib (Radix/React Aria) or hand-rolled behavior. Button and Separator can retire cleanly. Suggested G3.A–G split and 2 open questions (headless strategy + dialog visual contract acceptability) for Lead.
---


# Research findings — Base UI Sidebar consumer migration audit (G3 / Task 018)

Audit of consumers of `dashboard/components/ui/sidebar.tsx` (a Tailwind/Base-UI shadcn-style Sidebar shell, 695 LOC) to plan migration onto TUI primitives — `Navigation`, `SidebarLayout`, `ActionListItem`. Research only; no code changes.

## (a) Consumer inventory

11 first-party consumers across runtime + tests, plus the definition site itself. The shell exports 22 primitives (`Sidebar`, `SidebarProvider`, `SidebarTrigger`, `SidebarRail`, `SidebarInset`, `SidebarInput`, `SidebarHeader`, `SidebarFooter`, `SidebarSeparator`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupAction`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton`, plus `useSidebar` hook).

| # | Consumer | Sidebar primitives used | Surface area |
|---|----------|-------------------------|--------------|
| 1 | `components/ShellSidebarProvider.tsx` | `SidebarProvider` (with `keyboardShortcut`, `defaultOpen`) | Mounts the provider once at the shell boundary; reads keybind from `useSettings`. |
| 2 | `components/AppSidebar.tsx` | `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarMenuSkeleton`, `SidebarRail`, `useSidebar` | Top-level project-scoped tree; receives data from `useSessionStream`/`useProjects`/`fetchPlans`/`fetchSkills`. ~10 primitives, deepest consumer. |
| 3 | `components/app-shell/SidebarTree.tsx` | `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem` | Recursive data-driven tree walker; renders `SidebarItem[]` (sections / links / separators). Used by `AppSidebar`. |
| 4 | `components/app-shell/AppShell.tsx` | `SidebarInset` | Wraps the right-hand main content so it sits next to the sidebar with the correct shell padding. |
| 5 | `components/KeybindRoot.tsx` | `useSidebar` (`toggleSidebar`) | Wires the global `Mod+B` "toggle sidebar" action into the registry. |
| 6 | `components/sessions/SessionsNavigator.tsx` | `useSidebar` (`setOpenMobile`, `isMobile`) | Closes the mobile drawer when a session is selected. |
| 7 | `components/skills/SkillsNavigator.tsx` | `useSidebar` (`setOpenMobile`, `isMobile`) | Same mobile-close behavior on skill open. |
| 8 | `components/__tests__/AppSidebar.test.tsx` | imports `SidebarProvider` to wrap render | Test harness only. |
| 9 | `components/app-shell/__tests__/SidebarTree.test.tsx` | imports `SidebarProvider` to wrap render | Test harness only. |
| 10 | `components/sessions/__tests__/SessionsNavigator.test.tsx` | mocks `useSidebar` via `vi.mock("@/components/ui/sidebar", …)` | No real import — easy to relocate. |
| 11 | `components/skills/__tests__/SkillsNavigator.test.tsx` | mocks `useSidebar` via `vi.mock("@/components/ui/sidebar", …)` | No real import — easy to relocate. |
| def | `components/ui/sidebar.tsx` | self | 695 LOC. Provider/state machine + 22 primitive shells. The retire target. |

Indirect consumers worth flagging (not direct sidebar imports but rely on the same context): `components/TopBar.tsx`, `components/app-shell/MainTabsBar.tsx`, and `components/projects/AddProjectDialog.tsx` all call `openCommandPalette` or layout APIs that today coexist with the Cmd+B toggle path; they don't import sidebar primitives but they share keybind real estate.

## (b) Per-consumer migration approach

The TUI primitives map roughly as: `SidebarLayout` ↔ `<Sidebar>` (the chrome), `Navigation` (top bar; secondary use), `ActionListItem` ↔ `SidebarMenuButton`. The collapse/mobile/cookie story has no TUI counterpart and needs a wrapper (see (c)).

| Consumer | Approach | Notes |
|----------|----------|-------|
| `ShellSidebarProvider` | Replace `SidebarProvider` with a new `ShellSidebarShell` that owns: open/collapsed state, cookie persistence, `Mod+B` keybind plumbing, mobile-drawer state. Mount `<SidebarLayout sidebar={…}>` at the same boundary. | The provider is the keystone — every other consumer's migration depends on this one landing first with an equivalent context API. |
| `AppShell.SidebarInset` | Drop `SidebarInset`. With `SidebarLayout` the children become the right pane directly. | Trivial. Remove the wrapper component; pass `<MainTabContent />` etc. as children of `SidebarLayout`. |
| `AppSidebar` | Largest port. Replace `Sidebar`/`SidebarHeader`/`SidebarContent`/`SidebarFooter` with a plain `<aside>` whose body is divided into header / scrollable content / footer regions; pass it as `sidebar={…}` prop into `SidebarLayout`. Replace `SidebarMenuSkeleton` with the existing `<Skeleton>` primitive in `components/ui/Skeleton.tsx`. Drop `SidebarRail` (no TUI equivalent — the resize handle on `SidebarLayout` covers the use case). | Behavior to preserve: section expand/collapse, badges, action buttons, keyboard nav. None of these come from Base UI today — they are local state — so the port is just chrome, not behavior. |
| `SidebarTree` | Replace `SidebarGroup*` with semantic `<section>` + `<header>` + scrolling `<ul>`. Replace each `SidebarMenuButton` with `ActionListItem` (props line up: `icon`, `children`, `href`, `onClick`). `SidebarMenuAction` (the trailing action button) and `SidebarMenuBadge` have no direct TUI equivalent — render them inline inside `ActionListItem`'s children, right-aligned via `RowSpaceBetween`. | The recursion + motion variants are unaffected. The `render?` prop currently used by `SidebarMenuSubButton` (added in T010 for Base UI compatibility) is unused once we leave the shell — drop it. |
| `KeybindRoot` | Replace `useSidebar().toggleSidebar` with `useShellSidebar().toggleSidebar` from the new shell context. | One-line diff. |
| `SessionsNavigator`, `SkillsNavigator` | Replace `useSidebar().setOpenMobile/isMobile` with the equivalents on the new shell context. | Two-line diffs each. The mobile-drawer concept must survive the migration. |
| Tests with `SidebarProvider` wrapping (`AppSidebar.test`, `SidebarTree.test`) | Swap the wrapping component for the new `ShellSidebarShell` (or a thin `TestSidebarHost`). | Mechanical. |
| Tests with `vi.mock("@/components/ui/sidebar", …)` (`SessionsNavigator.test`, `SkillsNavigator.test`) | Update the mock import path to the new shell module. | Mechanical. |

## (c) Wrapper logic needed for collapse / icon-mode

`SidebarLayout` and `ActionListItem` cover the *visual* contract but not the *stateful* one. The behaviors `dashboard/components/ui/sidebar.tsx` currently provides that the TUI primitives do **not**:

1. **Three-state open model** — `expanded` / `collapsed` (icon-only on desktop) / `closed` (off-canvas drawer on mobile). `SidebarLayout` only has a numeric width, no semantic state.
2. **Cookie persistence** — `sidebar:state` cookie with 7-day TTL, hydrates initial state SSR-safe via `readSidebarCookie()`.
3. **Mobile drawer** — at `(max-width: 767px)`, the sidebar becomes a `Dialog` overlay with focus trap; `setOpenMobile` is the imperative API consumers reach for.
4. **Keyboard shortcut** — `Mod+B` registered at the provider level; defaultable per-user via `useSettings().keybinds["toggle-sidebar"]`.
5. **`useSidebar()` context** — `state`, `open`, `setOpen`, `openMobile`, `setOpenMobile`, `isMobile`, `toggleSidebar`.
6. **Icon-mode rendering** — when `state === "collapsed"`, `SidebarMenuButton` renders only the icon and exposes the label via Tooltip on hover. `ActionListItem` doesn't have a collapsed variant.

**Proposed wrapper shape** (one new module, `components/app-shell/sidebar-shell.tsx`):

```tsx
// Pseudocode — final API in the implementation task.
export function ShellSidebarShell({
  children,
  sidebar,
}: { children: ReactNode; sidebar: ReactNode }) {
  // owns open/collapsed/openMobile state, cookie, media query, Mod+B keybind
  // provides ShellSidebarContext
  // renders <SidebarLayout sidebar={collapsed ? <CollapsedRail/> : sidebar}>
  // mobile: renders <Dialog>{sidebar}</Dialog> instead of inline
}
export function useShellSidebar(): { state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar };
export function ShellActionListItem(props: ActionListItemProps & { tooltip?: string });
// ↑ wraps TUI ActionListItem, adds collapsed-icon-mode + tooltip-on-hover behavior
```

With those four pieces (`ShellSidebarShell`, `useShellSidebar`, `ShellActionListItem`, plus a `<CollapsedRail/>` for icon-mode) every consumer can migrate without losing functionality.

## (d) Suggested split into follow-up tasks

7 tasks, ordered by dependency. Tasks G3.S1–G3.S2 unblock everything else; G3.S3–G3.S6 can land in parallel; G3.S7 is the cleanup.

| # | Task | Scope | Depends on | Size |
|---|------|-------|------------|------|
| **G3.S1** | Build `ShellSidebarShell` + `useShellSidebar` context | New `components/app-shell/sidebar-shell.tsx`. Owns open/collapsed/mobile state, cookie, Mod+B keybind. Wraps `SidebarLayout`. No consumer migrations yet. Ship behind both APIs (old + new) coexisting. | none | M |
| **G3.S2** | Build `ShellActionListItem` (collapsed-icon-mode wrapper) | New helper around TUI `ActionListItem` that renders icon-only + tooltip when collapsed. | G3.S1 | S |
| **G3.S3** | Migrate `ShellSidebarProvider` + `AppShell` boundary | Replace `SidebarProvider`/`SidebarInset` usage. Smallest blast radius — these two files are pure plumbing. | G3.S1 | S |
| **G3.S4** | Migrate `AppSidebar.tsx` chrome | Replace `Sidebar`/`SidebarHeader`/`SidebarContent`/`SidebarFooter`/`SidebarRail`/`SidebarMenuSkeleton`. Keep `SidebarTree` consumers working via the shim from G3.S1. | G3.S1, G3.S3 | M |
| **G3.S5** | Migrate `SidebarTree.tsx` | Replace `SidebarGroup*`/`SidebarMenu*` with `<section>`+`ActionListItem`. Render `SidebarMenuAction`/`SidebarMenuBadge` inline via `RowSpaceBetween`. | G3.S2 | M |
| **G3.S6** | Migrate `useSidebar()` callers | Three files: `KeybindRoot`, `SessionsNavigator`, `SkillsNavigator`. Swap to `useShellSidebar()`. Update the four test files (two harness wraps + two `vi.mock` paths). | G3.S1 | S |
| **G3.S7** | Delete `components/ui/sidebar.tsx` + `@base-ui/react/dialog` dep audit | Remove the 695-LOC shell, drop `import { Dialog … }` cycle, run full tsc + vitest, check bundle size delta. Document any remaining `@base-ui/react/*` usage that needs its own retirement task. | G3.S3, G3.S4, G3.S5, G3.S6 | S |

**Open questions for Lead before implementation starts:**

1. **Mobile drawer.** Is the `(max-width: 767px)` mobile experience still in scope, or has the dashboard moved to desktop-only? If desktop-only, the wrapper in (c) gets simpler — three-state collapses to two-state, `setOpenMobile`/`isMobile` go away, and `SessionsNavigator`/`SkillsNavigator` shrink to no-ops.
2. **Icon-mode visual.** TUI `ActionListItem` has fixed 9.6px-wide character cells; rendering icon-only at the same row height needs a CSS override. Acceptable to add a single CSS module shim, or do we want a dedicated TUI primitive PR upstream?
3. **`SidebarRail` (drag-to-resize affordance).** Today's shell exposes a rail; `SidebarLayout`'s `isShowingHandle` prop is the rough equivalent. Drop the rail UI, or port the Tailwind hover styling onto the handle?

## 018: G3: Audit Sidebar/SidebarMenu consumer migration plan to TUI Navigation+SidebarLayout
Type: v2
Appended ~95-line audit section to .tmux-ide/library/research-findings.md (G3 / Task 018) covering: (a) consumer inventory — 11 first-party files plus the def site, broken down with which of the 22 sidebar primitives each one imports; (b) per-consumer migration approach — table mapping every consumer onto the TUI Navigation/SidebarLayout/ActionListItem replacement, including the smaller useSidebar()-only callers (KeybindRoot, SessionsNavigator, SkillsNavigator) and the test harnesses; (c) wrapper logic gap analysis — six behaviors the Tailwind shell provides that TUI primitives don't (three-state open model, cookie persistence, mobile drawer, Mod+B keybind, useSidebar() context, icon-mode rendering) plus a proposed ShellSidebarShell + useShellSidebar + ShellActionListItem + CollapsedRail wrapper API; (d) split into 7 follow-up tasks (G3.S1-S7) with dependency order, sizing, and scopes that each fit a single dispatch. 3 open questions for Lead surfaced (mobile drawer scope, icon-mode CSS override strategy, SidebarRail vs SidebarLayout handle). NO code changes.
---


## 029: Plan @pierre/diffs fold-in: full copy vs targeted shim
Type: research

### File inventory

`dashboard/node_modules/@pierre/diffs/dist/` totals **28,305 LOC** of compiled JS (without `.d.ts` / `.map`). Disk size of source-relevant subdirs:

| Subdir          | LOC     | Disk   | Notes                                                                              |
| --------------- | ------- | ------ | ---------------------------------------------------------------------------------- |
| `worker/`       | 17,939  | 2.8 MB | Off-thread Shiki highlighting + SAB. Largest single piece by far.                  |
| `components/`   | 3,499   | 568 KB | `File`, `FileDiff`, `VirtualizedFileDiff`, `Virtualizer`, `web-components`, etc.   |
| `utils/`        | 2,908   | 1.2 MB | Helpers consumed by components/managers/renderers/react alike.                    |
| `renderers/`    | 1,303   | 208 KB | DOM/HAST renderers used by both SSR and worker code paths.                        |
| `managers/`     | 1,096   | 192 KB | High-level orchestration (file-diff, line-annotation managers).                   |
| `react/`        | 644     | 288 KB | React surface: `PatchDiff`, `FileDiff`, `MultiFileDiff`, `Virtualizer`, hooks.    |
| `highlighter/`  | 405     | —      | Shiki adapter.                                                                    |
| `ssr/`          | 199     | —      | Server-side prerendering exports.                                                 |
| `shiki-stream/` | 104     | —      | Stream-based highlight pipeline.                                                  |
| root (5 files)  | 208     | —      | `index.js` (99) + `constants.js` (47) + `sprite.js` (57) + `style.js` (5) + `types.js` (0). |

Top-level NPM deps that dist code reaches into: `shiki@^3` + `@shikijs/transformers@^3` (highlighter), `diff@8.0.3` (patch parsing), `hast-util-to-html@9.0.5` (DOM serialization), `lru_map@0.4.1` (caching), `@pierre/theme@0.0.22` (token vocabulary).

### Dependency graph between dist subdirs

The two consumers in dashboard (`components/DiffViewer.tsx`, `components/diffs/DiffViewer.tsx`) both import `PatchDiff` from `@pierre/diffs/react`. PatchDiff's transitive closure through its compiled imports is:

```
PatchDiff (react/PatchDiff.js)
├── ../constants.js                     (DIFFS_TAG_NAME)
├── ../utils/getSingularPatch.js        (uses managers/* internally)
├── ./utils/templateRender.js
├── ./utils/renderDiffChildren.js
└── ./utils/useFileDiffInstance.js
    ├── components/FileDiff.js
    ├── components/VirtualizedFileDiff.js   ← virtualizer entry (LARGE)
    ├── utils/areOptionsEqual.js
    ├── ./constants.js
    ├── ./Virtualizer.js                    ← virtualization runtime
    ├── ./WorkerPoolContext.js              ← worker hand-off
    └── ./utils/useStableCallback.js
```

Reachable subdirs from PatchDiff's import closure: `react/` (mostly), `components/` (FileDiff + VirtualizedFileDiff branch), `utils/` (subset — option compare, renderers, managers helpers). `worker/`, `renderers/`, `managers/`, `highlighter/`, `shiki-stream/`, `ssr/` are reachable only when the **virtualizer + worker pool path** is exercised; PatchDiff itself doesn't render through the worker unless `<WorkerPoolContextProvider>` wraps it (we don't wrap in dashboard today).

In practice the dashboard already uses PatchDiff in non-virtualized, no-worker mode: the call site at `dashboard/components/DiffViewer.tsx:67-84` passes only `patch`, `options`, and `className`. Virtualization is ignored unless the file has thousands of lines (we already cap at 2,000 via `MAX_DIFF_LINES`), and worker highlighting requires explicit provider wiring not present in our tree. So the **active** code path is `<PatchDiff>` → `useFileDiffInstance` → `FileDiff` (the non-virtualized component) → patch parser → DOM render with sync Shiki highlighting.

### Recommended approach: **targeted shim (Option B), variant**

Recommendation: ship **(B-lite)** — keep `@pierre/diffs` as an npm dep AND own a thin `dashboard/components/tui-diffs/PatchDiff.tsx` wrapper (~30 LOC) that selects a tmux-ide-themed Shiki theme and clamps `diffStyle`/`diffIndicators`/`overflow`/`themeType`. Do NOT copy the dist into the repo.

Rationale: the only thing tmux-ide actually needs to "fold in" is **theme control + visual conformity**, not the diff-rendering engine itself. The engine is already excellent at what it does, the file size is paid lazily (only on /v2 + /diffs visits), and it's authored as a single import — `from "@pierre/diffs/react"`. The full copy (Option A) drags 28k LOC and 5 npm transitive deps into our repo and leaves us shipping our own divergent fork the moment the upstream releases a patch. The aggressive shim ((B) as originally framed: copy PatchDiff + deps, drop virtualizer/worker) saves nothing for us — virtualizer code is dead-weight bytes through tree-shaking, and the worker pool isn't even imported on the active code path. We'd be paying a maintenance tax for a tree-shake outcome we already get from the bundler.

If — after a follow-up bundle audit — turbopack proves it's NOT tree-shaking the virtualizer/worker paths cleanly (e.g. side-effect markers in `package.json` block elimination), revisit and step up to Option B proper. Until then, B-lite captures the theme-override goal at near-zero cost.

#### B-lite concretely (NOT in this task — out of scope per "NO code changes")

```text
dashboard/components/tui-diffs/
├── index.ts                # re-export PatchDiff wrapper as the canonical local API
├── PatchDiff.tsx           # ~30 LOC: thin wrapper that injects { theme: "tui-dark" | "tui-light", diffStyle, themeType }
└── tui-themes.ts           # 2 small Shiki theme objects mapped from --tui-* vars (or pulls from existing tui-bridge tokens)
```

Both existing call sites (`dashboard/components/DiffViewer.tsx`, `dashboard/components/diffs/DiffViewer.tsx`) swap their `from "@pierre/diffs/react"` import for `from "@/components/tui-diffs"` and drop their inline theme literal. Net code added in dashboard: ~50 LOC. Net code copied from `dist`: zero.

### Rough size estimate

| Approach              | Repo source delta | Bundle (gzip, est) | Maintenance |
| --------------------- | ----------------- | ------------------ | ----------- |
| (A) Full copy         | +28,305 LOC, +5 npm transitive deps inlined | ~unchanged on /diffs (already bundled today) | High — rebase against upstream every release; theme/codepath drift; LICENSE.md vendoring |
| (B) Targeted shim     | +~6,000 LOC (PatchDiff + non-virtualized FileDiff + Shiki adapter + utils tree) | ~5-10 KB smaller (tree-shaking + dropping virtualizer dead-import edges) | Medium — narrower surface to keep in sync but still on the hook for upstream patches |
| (B-lite, recommended) | +~50 LOC (theme wrapper) | ~unchanged (tree-shaker already prunes virtualizer/worker on cold paths) | Low — npm version bumps only |

### Risk list

1. **Tree-shake regression risk (B-lite).** `@pierre/diffs` declares `sideEffects: ["dist/components/web-components.js"]`. That single side-effect file imports from across the dist; if the bundler interprets the marker conservatively, `worker/` and `renderers/` may stay in the bundle even when unused. Mitigation: a one-shot bundle audit (`pnpm exec next build --analyze` or equivalent) on /v2 + /diffs to confirm `worker/worker.js` / `worker/highlight-worker.js` are absent before committing to B-lite.
2. **Theme contract instability (all options).** PatchDiff's `options.theme` accepts a Shiki theme name string. We'd register custom themes against Shiki's registry; upstream Shiki theme schema changes (rare but happens) would silently degrade rendering. Mitigation: pin `shiki` peer-dep range in dashboard's package.json to the same band `@pierre/diffs` requires (`^3`).
3. **Worker pool re-entry (B and B-lite).** If we later want off-thread highlighting (large repos with multi-thousand-line diffs), B-lite is trivially upgradable — wrap the `<PatchDiff>` site in `<WorkerPoolContextProvider>`. B (targeted shim that drops worker/) would require re-introducing the worker entry, partially undoing the reason for choosing B in the first place.
4. **Type drift (B).** `dashboard/node_modules/@pierre/diffs/dist/react/index.d.ts` exports a curated public surface. A targeted-shim copy would copy the JS but not necessarily the `.d.ts`s with the same public-types boundary, leading to broader-than-intended types leaking into our app — fixable by writing local declarations but adds work.
5. **License compliance (A).** apache-2.0 inlining requires preserving `LICENSE.md` in `dashboard/components/tui-diffs/` and an attribution NOTICE entry. Trivial to do but easy to forget under time pressure; reviewer would catch on PR. Not a risk for B-lite.
6. **`@pierre/theme@0.0.22` 0.x dep (A and B).** Inlining drags a 0.x-versioned dep — treat as unstable. B-lite avoids this entirely.

### Decision summary (1 line)

**Recommend B-lite.** Land a 50-LOC theme wrapper now, keep the npm dep, gate any further fold-in behind a real bundle-size audit. Re-open the question only if turbopack tree-shaking can't strip `worker/`+`renderers/`.

NO code changes in this task.
## 029: Plan @pierre/diffs fold-in: full copy vs targeted shim — output decision doc
Type: diffs
Appended a ~85-line decision doc to .tmux-ide/library/research-findings.md (section "029: Plan @pierre/diffs fold-in: full copy vs targeted shim"). NO code changes — pure research per dispatch.

Section structure:

  - File inventory: subdir-by-subdir table covering all 9 dist subdirs + 5 root files. Total dist = 28,305 LOC. Worker (17,939 LOC, 2.8 MB) is the dominant single piece; components/utils together are ~6,400 LOC; react/ proper is only 644 LOC.
  - Top-level npm deps the dist reaches: shiki@^3, @shikijs/transformers@^3, diff@8.0.3, hast-util-to-html@9.0.5, lru_map@0.4.1, @pierre/theme@0.0.22.
  - Dependency graph: traced PatchDiff (the only thing dashboard actually imports) through its compiled imports. Reachable closure includes react/* + components/{FileDiff, VirtualizedFileDiff, Virtualizer, WorkerPoolContext} + a slice of utils/. worker/, renderers/, managers/, highlighter/, ssr/, shiki-stream/ are reachable only when the virtualizer + worker-pool path is exercised — and we don't wire WorkerPoolContextProvider in dashboard, so those are dead imports on the live path.
  - Active path documented: dashboard's PatchDiff usage at components/DiffViewer.tsx:67-84 passes only patch/options/className with a 2,000-line cap (MAX_DIFF_LINES). No virtualization, no worker.
  - Recommended approach: B-lite (a third option not in the dispatch). Keep @pierre/diffs as an npm dep AND own a ~30-LOC dashboard/components/tui-diffs/PatchDiff.tsx wrapper that injects tmux-ide-themed Shiki themes + clamps diffStyle/themeType. Net dashboard delta ~50 LOC; net dist copied = 0. Both Option A (full copy, +28k LOC + 5 npm transitive deps inlined) and Option B as originally framed (copy PatchDiff + deps, drop virtualizer/worker) lose the maintenance battle vs. tree-shaking the dead virtualizer/worker bytes for free.
  - Comparison table: repo delta + bundle size (gzip est) + maintenance burden across A / B / B-lite.
  - Risk list (6 items): tree-shake regression (mitigated via a bundle audit before committing), theme contract instability (mitigated via shiki peer-dep pin), worker pool re-entry, type drift, license compliance for apache-2.0 inlining, @pierre/theme@0.0.22 0.x dep risk for inlining options.
  - 1-line decision summary at the end recommending B-lite, with explicit gating: re-open only if a bundle audit shows worker/renderers aren't tree-shaken.

Open questions / follow-ups (called out in the doc, not blockers):
  - Run pnpm exec next build --analyze on /v2 + /diffs once dev settles, confirm worker/worker.js + worker/highlight-worker.js absent from the active bundle. If present, escalate from B-lite to B-proper.
  - Pin shiki peer-dep range explicitly in dashboard/package.json to match @pierre/diffs band (^3).

Files touched: .tmux-ide/library/research-findings.md only (261 → 349 lines, additive). Zero code edits, zero tsc/vitest impact.
---


# Research findings — src/ vs packages/daemon/src/ divergence audit (Task 039)

`diff -rq src packages/daemon/src` returns 27 entries (run 2026-05-08):

| Bucket | Count | Files |
|--------|------:|-------|
| Only in `packages/daemon/src` | 11 | `acp/`, `chat/`, `codex/`, `active-projects.ts`, `app-settings.ts`, `auth-token.ts`, `canonical.ts`, `embed.ts`, `index.ts`, `command-center/actions/handlers/chat-actions.ts`, `command-center/actions/handlers/chat-actions.test.ts` |
| Only in `src` | 2 | `app-cli.ts`, `ui.ts` |
| Differ | 14 | `command-center/{actions/contract.ts, actions/errors.ts, actions/registry.ts, actions/handlers/daemon-shutdown.ts, actions/handlers/daemon-shutdown.test.ts, server.ts, static.ts, ws-events.ts}`, `lib/{cli-action-bridge.ts, daemon-embed.ts, daemon.ts}`, `schemas/ws-events.ts`, `status.ts`, `widgets/resolve.ts` |

File counts: `src/` 260 `.ts/.tsx`; `packages/daemon/src/` 298. The dispatch's "229 vs 267" is close — the gap reflects packages/daemon's chat/codex/acp folders + handlers + scaffolding.

## Per-area canonical decision

| Area | Canonical side | Reason |
|------|----------------|--------|
| `acp/` | **packages/daemon** | Only exists there. Full ACP protocol module — keep as-is. |
| `chat/` | **packages/daemon** | Only exists there. Thread store, provider discovery, manager, types — load-bearing for chat actions. |
| `codex/` | **packages/daemon** | Only exists there. Codex client + protocol. |
| `command-center/actions/contract.ts` | **packages/daemon** (newer 2026-05-06) | Adds `chat.*` discriminated unions (`StopReasonZ`, `AgentProviderZ`, etc.). 253 diff lines, all additive on packages side; src has nothing exclusive worth saving. |
| `command-center/actions/errors.ts` | **packages/daemon** (newer) | 12-line delta — chat error codes added on packages side. |
| `command-center/actions/registry.ts` | **packages/daemon** (newer) | Wires the 11 chat handlers (thread.list/create/get/rename/delete, session.send/cancel, providers.list, permission.respond, thread.usage, context.captureTerminal). 85 diff lines. |
| `command-center/actions/handlers/chat-actions.{ts,test.ts}` | **packages/daemon** | Only exists there. |
| `command-center/actions/handlers/daemon-shutdown.{ts,test.ts}` | **packages/daemon** (newer) | Adds `resetChatProvidersListCache()` to shutdown sequence. Tiny delta, no merge conflict. |
| `command-center/server.ts` | **MERGE** — packages/daemon as base + 6 endpoints from src | src/ is newer (2026-05-07) and has 6 endpoints packages/daemon lacks: `GET /api/widget/:name/spawn`, `GET /api/project/:name/files`, `GET /api/project/:name/preview/:file{.+}`, `GET /api/project/:name/config`, `POST /api/project/:name/config`, `POST /api/project/:name/restart`. packages/daemon has chat/codex initialization elsewhere in the file that src lacks. Both must survive. |
| `command-center/static.ts` | **packages/daemon** (newer) | 37-line delta, no apparent src-only signal. |
| `command-center/ws-events.ts` | **packages/daemon** (newer) | Adds `ChatEvent` broadcast plumbing + per-client dispatch. |
| `lib/cli-action-bridge.ts` | **packages/daemon** | Uses relative imports (`../command-center/actions/contract.ts`) and references `canonical-daemon.ts` (only exists in packages/daemon). src/ uses workspace-package aliases (`@tmux-ide/daemon/contract`) which break once the file *is* the package. |
| `lib/daemon-embed.ts` | **packages/daemon** (newer) | 18-line delta — chat/codex bootstrap on packages side. |
| `lib/daemon.ts` | **packages/daemon** | Identical except `import` shape: src uses `@tmux-ide/daemon`, packages uses `./daemon-embed.ts`. Packages' relative form is correct intra-package. |
| `lib/canonical-daemon.ts` | **packages/daemon** | Only exists there; referenced by status.ts and cli-action-bridge.ts. |
| `schemas/ws-events.ts` | **packages/daemon** (newer) | Adds ChatThreadIndexEntry, ChatSessionUpdate, etc. zod schemas (87-line delta). |
| `status.ts` | **packages/daemon** | Identical except import shape (relative vs alias). |
| `widgets/resolve.ts` | **MERGE** — packages/daemon as base + `WidgetSpawnSpec`/`resolveWidgetSpawn` from src | src/ (2026-05-07) added a structured PTY-spawn helper used by the new `/api/widget/:name/spawn` endpoint. packages/daemon doesn't have it. |
| `app-cli.ts` | **port to packages/daemon** | 17 LOC; only consumer is `bin/cli.ts` via dynamic import. After move, bin/cli.ts imports from `@tmux-ide/daemon`. |
| `ui.ts` | **port to packages/daemon** | 74 LOC; same consumer pattern as app-cli.ts. Already imports from `@tmux-ide/daemon` so it's a thin shim — can either move into packages/daemon or rewrite as direct internal use. |

Everything **else** in `src/` (the ~260 .ts files not in the 27-line diff) is byte-identical to its packages/daemon counterpart and only needs deletion-from-src after packages/daemon is the canonical home.

## Files that need real merge work

Two only:

1. **`command-center/server.ts`** — merge 6 v2 endpoints from src into the packages/daemon copy. Each endpoint is self-contained — no shared state with the chat/codex paths — so the merge is appendable. Listed in order of insertion below the existing handlers:
   - `GET /api/widget/:name/spawn`
   - `GET /api/project/:name/files`
   - `GET /api/project/:name/preview/:file{.+}`
   - `GET /api/project/:name/config`
   - `POST /api/project/:name/config`
   - `POST /api/project/:name/restart`

2. **`widgets/resolve.ts`** — port the `WidgetSpawnSpec` interface + `resolveWidgetSpawn(type, opts)` function + `WIDGET_TYPES` export from src into packages/daemon's copy. ~25 lines, additive.

No file required dual-side unique pieces beyond these two — every other "differ" entry is a strict superset on the packages/daemon side.

## Other considerations

- **Workspace import shape.** src/ files import from `@tmux-ide/daemon`, `@tmux-ide/daemon/contract`, `@tmux-ide/daemon/errors` — these are the workspace package aliases. Once `packages/daemon/` IS the canonical tree, intra-package files must use **relative paths** instead. The packages/daemon copies already do, so no rewrite is needed for those files. **Other consumers** that need to keep using the workspace alias: `bin/cli.ts`, `app-electron/src/main.ts`, the dashboard. They are unaffected by the consolidation.
- **Tests.** Both trees ship `__tests__/` and `*.test.ts` files. Where the implementation moves, the matching test moves with it. Where they're identical, deletion-from-src is enough.
- **`src/widgets/`** — the OpenTUI widget binaries (`changes/`, `config/`, `costs/`, `explorer/`, `mission-control/`, `preview/`, `setup/`, `tasks/`). These are not daemon-side code; they are spawned by the daemon as separate processes via `widgets/resolve.ts`. They *can* live anywhere the daemon can resolve at runtime. Recommended target: keep them under `packages/daemon/src/widgets/` so the resolve-path logic stays simple, OR split into a sibling `packages/widgets/` workspace package later. The audit doesn't gate on this — both trees already carry identical widget source.
- **`scripts/` and `bin/`** in the repo root are not in scope — they're CLI entry-points and stay where they are.

## Proposed relocation order (daemon stays runnable at every step)

The mantra: **packages/daemon is already the live daemon process** (per `bin/cli.ts` workspace imports). src/ is the legacy mirror. So the relocation is *deletion-from-src + small diff-recovery*, not a move. This means at no point is the daemon broken.

**Step 0 — Verify** (sanity check before any change).
- Confirm `pnpm dev` / the canonical daemon spawns out of `packages/daemon/` only.
- Confirm `bin/cli.ts` imports come from `@tmux-ide/daemon` (already true today for daemon entry points).
- Snapshot the current `tsc` baseline (currently 10 errors in dashboard/, separate count in src/).

**Step 1 — Recover the 6 v2 endpoints** into `packages/daemon/src/command-center/server.ts`.
- Copy the 6 handler blocks from `src/command-center/server.ts` (verbatim — they don't depend on src/-only code).
- Run `pnpm typecheck` from repo root. Daemon still runs.

**Step 2 — Recover `widgets/resolve.ts`** — port the `WidgetSpawnSpec` interface + `resolveWidgetSpawn` + `WIDGET_TYPES` export from `src/widgets/resolve.ts` into `packages/daemon/src/widgets/resolve.ts`.
- Run typecheck.

**Step 3 — Port `app-cli.ts` and `ui.ts`** into `packages/daemon/src/`.
- Adjust their imports from `@tmux-ide/daemon` to relative paths.
- Update `bin/cli.ts`'s dynamic imports from `await import("../src/app-cli.ts")` / `"../src/ui.ts"` to import from `@tmux-ide/daemon` (re-export from the package's `index.ts`).
- Run typecheck + smoke `tmux-ide doctor` and `tmux-ide ui`.

**Step 4 — Delete `src/`** wholesale. By this point:
- Every byte-identical file in src/ has a counterpart in packages/daemon/.
- Every divergent file's unique pieces have been recovered into packages/daemon/.
- Every src-only file has been ported.
- `bin/cli.ts` and `app-electron/src/main.ts` consume `@tmux-ide/daemon` exclusively.
- Update `tsconfig.json`, `package.json`, `eslint.config.js`, `.gitignore`, and any `pnpm-workspace.yaml` references that mention `src/`.

**Step 5 — Run the full suite**: `pnpm check` (workspace) + `pnpm test:dashboard` + `pnpm test:integration` + a manual `tmux-ide` boot. The daemon must come up clean.

**Step 6 — Optional cleanup (separate PR)**: rename `packages/daemon/src/` to a flatter layout (e.g. an `apps/server/` shape per the t3code reference) if Lead wants the t3 convention. This is a no-op symlink/move once the consolidation lands and is best done afterward to avoid combining two structural changes in one diff.

## Risk + open questions

1. **Rolling-back step 1 or 2 mid-flight** is trivial (revert the merge commit). After step 4, src/ is gone — rollback means restoring from git. Recommend a single commit per step plus a tag at step 0 (`pre-src-consolidation`).
2. **Dashboard test mocks** — a few dashboard tests mock paths like `../../src/...` (none today by quick grep, but worth a final `grep -rE "from \"\\.\\./\\.\\./src" dashboard` before step 4).
3. **CI workflow** — `.github/workflows/ci.yml` may reference `src/` directly (test paths, lint globs). Audit before step 4.
4. **`scripts/` references** — repo-root scripts may shell into `src/...`. Quick audit: `grep -rE "src/" scripts/`.
5. **Open question for Lead:** keep `packages/daemon/` or rename to `apps/server/` per t3code? The audit assumes "keep packages/daemon/" because it's already a workspace package and renaming compounds the diff. If Lead wants apps/server/, do it as step 6.

# Research findings — v2 IDE rebuild gating audit (Task 050)

Three-part research that gates a multi-day rebuild covering signals/atoms,
view modes, chat restoration, terminal-tab distinction, and t3-style
structure adoption. **No code changes** in this task; output drives later
implementation work.

## Part 1 — t3code structural audit

`context/t3code/` is a Bun + Turbo monorepo with `apps/` and `packages/`.

### apps

| App | Purpose | Key deps | Notes |
|-----|---------|----------|-------|
| `apps/server` (`t3`) | The daemon. Bootstraps via `bin.ts`; bundles a Bun-based HTTP/WS server, the Anthropic agent SDK, opencode SDK, `@pierre/diffs`, `node-pty`, and a SQLite store via `@effect/sql-sqlite-bun`. | `@anthropic-ai/claude-agent-sdk`, `@effect/platform-bun`, `@opencode-ai/sdk`, `@pierre/diffs`, `effect`, `node-pty` | Maps to our `packages/daemon/` after T040. Pattern of `apps/server/src/{bin.ts,bootstrap.ts,http.ts,...}` with feature folders (`auth/`, `git/`, `environment/`, `checkpointing/`) is cleaner than our flat `packages/daemon/src/*.ts` top-level dump. Worth porting that arrangement in a follow-up task. |
| `apps/web` (`@t3tools/web`) | The browser UI. Uses Vite + `@base-ui/react` + `@dnd-kit/*` + `@effect/atom-react` + `@legendapp/list` (virtual list) + `@formkit/auto-animate`. | `@base-ui/react`, `@effect/atom-react`, `@dnd-kit/*`, `@legendapp/list` | Maps to our `dashboard/`. Note: t3code uses **both** `@effect/atom-react` (`apps/web/src/rpc/serverState.ts` etc.) **and** `zustand` (`apps/web/src/uiStateStore.ts`) — they didn't pick one, they layered both. |
| `apps/desktop` (`@t3tools/desktop`) | Electron shell. | `electron`, `electron-updater`, `effect`, `@effect/platform-node` | Maps to our `app-electron/`. |
| `apps/marketing` (`@t3tools/marketing`) | Astro site. | `astro` | No analogue in our repo (we use the docs site under `docs/content/`). |

### packages

| Package | Purpose | Exports | Maps to (or gap) |
|---------|---------|---------|------------------|
| `packages/contracts` (`@t3tools/contracts`) | **Single source of truth for wire schemas + types**. Effect-Schema based. Two top-level subpath exports (`./settings`, `.`). | `.`, `./settings` | Our `packages/daemon/src/schemas/` lives inside the daemon package and is re-exported as `@tmux-ide/schemas`. Promoting to a separate workspace package would let dashboard and daemon share without dashboard pulling daemon's runtime tree as a transitive dep. **Strong recommendation**: extract our `schemas/` to `packages/contracts/` in a future task. |
| `packages/shared` (`@t3tools/shared`) | Cross-cutting helpers used by both server and web — `model`, `git`, `sourceControl`, `logging`, `shell`, plus keybinding defaults. | 5 subpath exports | Our equivalent helpers live in `packages/daemon/src/lib/` (yaml-io, tmux, etc.) and `dashboard/lib/`. A `packages/shared` for things that genuinely cross the boundary (keybinding defaults, ANSI color tokens, project-name validation) would clean things up. |
| `packages/client-runtime` (`@t3tools/client-runtime`) | Effect-based RPC client runtime — `Atom`-friendly bindings to the contracts. | `.` | We don't have a clean analogue. Closest is `dashboard/lib/api.ts` + `dashboard/lib/wsBus.ts`. |
| `packages/effect-acp` | ACP (agent communication protocol) Effect Schema bindings. | `./client`, `./agent`, `./schema`, `./rpc`, `./protocol` | Direct analogue: our `packages/daemon/src/acp/` (5 files including client/protocol/schema). t3code's deeper sub-export shape is portable — it lets consumers pick `effect-acp/client` without pulling the agent server bits. |
| `packages/effect-codex-app-server` | Codex protocol bindings (sister to `effect-acp`). | `./client`, `./schema`, `./rpc`, `./protocol`, `./errors` | Direct analogue: our `packages/daemon/src/codex/`. |
| `packages/ssh` | SSH command/config/tunnel/auth helpers. | `./auth`, `./command`, `./config`, `./errors`, `./tunnel` | We don't ship SSH. Feature parity not required. |
| `packages/tailscale` | Tailscale platform helpers. | `.` | We have `packages/daemon/src/lib/tunnels/` for ngrok/cloudflare; tailscale isn't on our roadmap. |

### Conventions worth porting

1. **Feature folders inside the daemon** (`apps/server/src/{auth,environment,git,checkpointing,...}/`) — much easier to navigate than our 100+ flat `packages/daemon/src/*.ts` top-level files. Suggested follow-up task: T060 "feature-folder reshape of packages/daemon/src" — risk is moderate (lots of import path updates) but mechanical.
2. **Subpath exports per concern** (e.g. `effect-acp/client` vs `effect-acp/agent`) — lets the dashboard import `@tmux-ide/contracts/settings` without dragging in the whole tree. Pairs naturally with the `packages/contracts` extraction.
3. **`@effect/atom-react` for cross-cutting reactive RPC state** (latency, ws connection, server config) **+ `zustand` for plain UI state** (collapsed groups, expanded threads). The split reflects the natural fault line: RPC state benefits from Atom's lazy/keepAlive/labels; UI state doesn't need it.

What does **not** translate cleanly: the heavy Effect Runtime adoption. T3 has bought Effect across the board (scheduling, error channels, sql-sqlite-bun). Our stack is straight TypeScript + Hono. Importing one Effect-based package is fine; rewriting everything in Effect is out of scope.

## Part 2 — Signal library decision (the gating call)

Scoring `@effect/atom-react` vs `jotai` vs `zustand` for the v2 dashboard rebuild.

### Bundle size (gzipped, current published versions)

| Lib | Min+gzip core | Notes |
|-----|---------------|-------|
| `zustand` | ~1.0 KB | The smallest. No dependencies. |
| `jotai` | ~3.5 KB | Core only; jotai-utils adds a bit more. No deps beyond React. |
| `@effect/atom-react` | ~10 KB + Effect runtime (~50 KB gzipped of `effect`) | Effect itself is the real cost — a one-shot install if not already loaded, but our dashboard does **not** ship Effect today. Adopting `@effect/atom-react` means inheriting Effect, which cascades. |

Winner on bundle: **zustand** by an order of magnitude.

### API ergonomics — sample code for three v2 states

State (a): current view (`'mission' | 'kanban' | ...`). State (b): sidebar collapsed boolean. State (c): snapshot from `useSessionStream` (async, server-pushed).

**zustand**:
```ts
// store.ts
import { create } from "zustand";

export type ViewId = "mission" | "kanban" | "tasks" | "files" | "preview" | "metrics";

export const useUiStore = create<{
  view: ViewId;
  setView: (v: ViewId) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}>((set) => ({
  view: "mission",
  setView: (view) => set({ view }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));

// Snapshot (server-pushed) wrapped in a tiny store:
export const useSessionStore = create<{
  snapshot: SessionSnapshot | null;
  setSnapshot: (s: SessionSnapshot | null) => void;
}>((set) => ({ snapshot: null, setSnapshot: (snapshot) => set({ snapshot }) }));

// Component:
const view = useUiStore((s) => s.view);
const setView = useUiStore((s) => s.setView);
const collapsed = useUiStore((s) => s.sidebarCollapsed);
```

**jotai**:
```ts
// atoms.ts
import { atom, useAtom, useAtomValue } from "jotai";

export const viewAtom = atom<ViewId>("mission");
export const sidebarCollapsedAtom = atom(false);

// Snapshot — atomWithSubscription for the WS push:
export const sessionSnapshotAtom = atom<SessionSnapshot | null>(null);

// Component:
const [view, setView] = useAtom(viewAtom);
const collapsed = useAtomValue(sidebarCollapsedAtom);
```

**@effect/atom-react**:
```ts
import { Atom } from "effect/unstable/reactivity";
import { useAtomValue, useAtomSet } from "@effect/atom-react";

export const viewAtom = Atom.make<ViewId>("mission")
  .pipe(Atom.keepAlive, Atom.withLabel("ui.view"));

export const sidebarCollapsedAtom = Atom.make(false)
  .pipe(Atom.keepAlive, Atom.withLabel("ui.sidebar.collapsed"));

// Snapshot — derived async atom from a stream:
export const sessionSnapshotAtom = Atom.fromStream(() => sessionSnapshotStream).pipe(
  Atom.keepAlive,
  Atom.withLabel("session.snapshot"),
);

// Component:
const view = useAtomValue(viewAtom);
const setView = useAtomSet(viewAtom);
```

**Verdict on ergonomics**: jotai and zustand are equally clean for our cases. `@effect/atom-react` reads beautifully **once Effect is in the codebase** but assumes an Effect runtime, schemas, and stream constructors that we'd have to bring in.

### Async / error handling

- `zustand` — manual. Pairs naturally with TanStack Query for server state (and we don't currently use TanStack Query, but Lead asked us to consider it). Errors are whatever the consumer puts in the store.
- `jotai` — `loadable` + `atomWithQuery` (jotai-tanstack-query) + Suspense boundaries. Good async story. Errors via Suspense's ErrorBoundary.
- `@effect/atom-react` — first-class. `Atom.fromStream`, `Atom.fromEffect`, typed errors, structured Cause. **Best of the three** for async, but this is precisely where the Effect runtime is most load-bearing.

### DevTools

- `zustand` — Redux DevTools middleware (one line: `devtools(...)`). Mature.
- `jotai` — Atom DevTools via `jotai-devtools` extension.
- `@effect/atom-react` — Atom labels show in Effect DevTools (separate Effect tooling).

All three have tooling; zustand's is the most familiar to teams coming from Redux.

### Compatibility with TanStack Query

We don't use TanStack Query in dashboard today (verified — not in `dashboard/package.json`). If we adopt it for server state:
- `zustand` is most idiomatic — TanStack owns server state, zustand owns UI state. Clean split.
- `jotai` integrates via `jotai-tanstack-query`. Slight friction (atom adapter).
- `@effect/atom-react` overlaps with TanStack — they solve the same problem from different runtimes. Picking both adds confusion.

### Recommendation: **`zustand`**.

Reasoning (concrete):

1. **Bundle cost** — 1 KB vs 50+ KB for the Effect runtime. Our existing dashboard has no Effect; adopting `@effect/atom-react` means a multi-day rewrite of the API/WS layer to fit Effect's primitives.
2. **Existing patterns line up** — our handful of stores (`projectStore.ts`, `addProjectDialogStore.ts`, `useLayoutState.ts`, `newChatPickerStore.ts`) are already module-level subscribe/snapshot stores. They are essentially zustand stores written by hand. Moving to `create()` is a one-file edit per store, not a paradigm shift. Low-risk migration.
3. **Async story** — pair with TanStack Query for server-state (REST + SSE refresh). Zustand owns the rest. This split is the same fault line t3code chose (atom-react for RPC, zustand for UI state), but with TanStack instead of atom-react on the data side. TanStack is much more widely understood than Effect, easier to onboard contributors, and doesn't drag in a runtime.
4. **DevTools** — Redux DevTools just works. Zero new tooling for the team.
5. **t3code precedent** — they ship `zustand` *and* `@effect/atom-react`. Where they use atom-react is precisely the surface area Effect already pays for itself. We don't have that base.

Where we'd reach for `@effect/atom-react` later: if/when we adopt Effect for the daemon-side scheduling work (currently no plans), the atom-react integration becomes free. Until then, stay with zustand.

## Part 3 — Spec sketches

### View modes (Code / Mission / Chat / Terminal)

T047 introduces an activity bar with named view-mode presets. Each preset is a saved configuration of the three layout dimensions: which sidebar tree is mounted, which set of MainTabs is open, and the `react-resizable-panels` layout (sidebar/main/inspector widths + main/terminal heights).

Storage: a single zustand store `useViewModeStore` keyed by mode name. The store persists each mode's layout snapshot to localStorage under `tmux-ide.v2.layout.v1.<mode>.<axis>` — the existing `useStoredLayout(key)` hook becomes a selector against that store. Active mode is its own atom (`activeMode: 'code' | 'mission' | 'chat' | 'terminal'`); switching modes calls `setLayout(mode, ...)` from any panel's `onLayoutChange`. `react-resizable-panels` sees a controlled layout via `defaultLayout={layoutForMode(activeMode, axis)}` keyed on the active mode so a mode switch remounts the Group with fresh sizes. Mode-specific tab strips: each mode owns its own `openTabs[]` (so the user's chat tabs don't get dragged into Code mode and vice-versa), but a small set of **pinned** tabs (the project terminal, the active mission view) can opt-in to being shown across modes. Activity bar buttons are simple `setActiveMode(...)` triggers; the bar itself reads `activeMode` and highlights.

Open question for Lead: mode switches must preserve scroll position inside MainTabContent. Either: (a) every per-mode tab gets `display: none` when the mode is inactive (memory cost), or (b) a tab serializer captures scroll on hide and restores on show. Recommend (a) up to ~20 inactive tabs.

### Chat mode restoration

The daemon side is in good shape: `packages/daemon/src/chat/` already has `thread-store.ts`, `thread-manager.ts`, `provider-discovery.ts`, `context-actions.ts`, plus the `ChatEvent` broadcast plumbing on `ws-events.ts` and the 11 chat actions on `command-center/actions/handlers/chat-actions.ts`. The action contract surface is `chat.thread.list/create/get/rename/delete/usage`, `chat.session.send/cancel`, `chat.providers.list`, `chat.permission.respond`, `chat.context.captureTerminal`. Wire shape lives in `@tmux-ide/schemas/ws-events` (ChatThreadIndexEntry, ChatSessionUpdate).

Frontend surface that needs building for the v2 mount:
- A **chat thread list rail** — replaces the Plans/Skills sub-list in chat mode; queries `chat.thread.list`, subscribes to `chat-thread-updated` push frames.
- A **chat tab kind** — already partly there (`ChatTabPanel.tsx` mounts `@tmux-ide/chat-solid` as a Solid island via `mod.mount(el, {...})`). The Solid island handles message rendering + composer. The React side just owns the host element + lifecycle. v2 needs the chat tab kind plumbed into MainTabContent's switch.
- A **provider-picker dialog** — `NewChatPicker.tsx` exists; needs reskin to TUI primitives but the wiring is right.
- A **permission-respond UI** — when the chat session emits `chat.session.permission.requested`, the user must approve/deny tool calls. Today there's no React UI for this — the Solid island may already render a dialog; verify before duplicating.

v2 mount sketch: chat mode's activity-bar entry switches active mode, MainTabsBar shows the per-thread tabs, MainTabContent renders `<ChatTabPanel sessionName={...} threadId={tab.threadId} />` for the active chat tab. The thread list rail lives in the sidebar slot for chat mode (replacing the SessionsTree/SkillsTree). Per-mode persisted layouts (Part 1 of this section) save the chat-mode's panel widths separately from Code mode's.

### Terminal-tab distinction

Today every tab is a `Tab` with `kind: 'view' | 'file' | 'skill' | 'chat' | 'terminal' | 'settings'`. Terminals are first-class in `openTabs[]` and survive view switches via the `display: none` keep-alive trick in `TerminalsHost`. v2 should formalise the distinction: a **terminal tab is a long-lived process attached to a `terminalTabId`-keyed PTY**, whereas other tab kinds are stateless views.

NavigationState signal split (zustand):
- `useNavigationStore` — `{ openTabs, activeTabId }` for the **view** tab strip (whatever's mounted in MainTabsBar above MainTabContent).
- `useTerminalStore` — `{ openTerminalTabs, activeTerminalTabId, defaultTerminalTabId }` for the terminal-pane strip below. Terminal tabs are addressed by stable id (`session:cwd` hash or random UUID at first attach).

Layout difference: the terminal pane is its own `Panel` in the vertical Group (already true in ProjectV2Page). When terminal mode is active in the activity bar, the terminal pane gets the dominant flex weight (e.g. 70/30 instead of 30/70); when Code mode is active the ratio inverts. The "focused" terminal tab from `useTerminalStore` controls which `Terminal` instance gets keyboard focus — but ALL of them stay mounted to keep PTY state alive. This split also makes ⌘J = "toggle terminal pane visibility", ⌘Shift-T = "open new terminal tab", ⌘W = "close active VIEW tab" (does not kill terminals — that's a separate destructive action like `tmux kill-session`).

The split is non-invasive at the migration boundary: today's `openTabs` already has both kinds; we partition on read (`openTabs.filter(t => t.kind === 'terminal')` for the terminal store's projection) and let the two stores be the canonical source of truth going forward. Tests touching `useNavigation()` get migrated piecemeal.

## Recommendations summary

1. **Adopt zustand** for v2. Migrate the four hand-rolled stores (`projectStore`, `addProjectDialogStore`, `newChatPickerStore`, `useLayoutState`) plus build new view-mode + terminal stores on it. Pair with TanStack Query for server state when we need cache-invalidation semantics beyond what the WS bus already provides.
2. **Extract `packages/contracts`** in a follow-up — separate workspace package for schemas + wire types. Lets dashboard import `@tmux-ide/contracts` without depending on `@tmux-ide/daemon` (which is currently a heavy dep with Bun-only modules). T060 candidate.
3. **Reshape `packages/daemon/src/`** into feature folders matching t3code's `apps/server/src/{auth,environment,git,...}` shape. T061 candidate. Mechanical, low-risk, big readability win.
4. **Build view modes on a single `useViewModeStore`** + per-mode persisted layouts via the existing `useStoredLayout` hook (refactored to read from the store).
5. **Restore chat mode** by adding a chat-mode preset to the activity bar + a chat thread list rail; the daemon side is already complete.
6. **Split NavigationState** into `useNavigationStore` (view tabs) and `useTerminalStore` (terminal tabs). Partition today's `openTabs[]` on read; keep both in sync via the same WS bus.

## Open questions for Lead

1. **TanStack Query opt-in** — yes/no for server state in v2? If yes, the dashboard package adds it as a dep and we wire `useSessionStream` and `fetchSessions` through it.
2. **Per-mode tab keep-alive cap** — accept memory cost of mounting all per-mode tabs (`display: none`), or invest in a scroll/state serializer? Recommend the simpler cap-at-20-tabs approach unless usage shows otherwise.
3. **Effect adoption appetite** — re-confirm that we are *not* moving toward Effect in the daemon. If that changes within 6 months, the signal-library decision flips to `@effect/atom-react`.
4. **`packages/contracts` extraction timing** — block on T060 before adopting zustand (so the new stores import from `@tmux-ide/contracts` not `@tmux-ide/schemas`)? Or land zustand first and rename imports during the contracts extraction? Recommend: land zustand first, rename in the contracts PR.
