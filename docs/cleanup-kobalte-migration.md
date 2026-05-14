# Cleanup audit — adopt `@kobalte/core` for UI primitives

Per [ARCHITECTURE.md §7.2 item 9](../ARCHITECTURE.md#72--medium-value--medium-risk).

Background: §1 names Kobalte as the UI-primitive layer (the opencode
pattern). §2 lists it under the locked-in stack ("Kobalte — planned
migration; some Base UI today"). In practice the dashboard, `chat-solid`,
and `v2-solid-widgets` ship **zero** Kobalte usage and **zero**
`@base-ui/*` usage today — every Dialog / Popover / Menu / Tooltip /
Combobox / Select is hand-rolled out of raw `<div role="...">` plus
`createSignal` + document-level pointer/keyboard listeners. The visual
output works but each rebuild ships its own focus trap, its own outside-
click handler, its own ARIA story, and its own keyboard contract — a
recipe for drift.

This audit lists every hand-rolled primitive in the three component
homes and names the Kobalte component that replaces it. No migrations
are landed in this document beyond the **worked example**
(`PermissionDialog` → `@kobalte/core/dialog`) shipped in the same commit.

## Inventory

### `packages/chat-solid/src/components/`

| #   | File                          | Hand-rolled primitive                                                                 | Kobalte replacement                       | Notes                                                                                                                                                                       |
| --- | ----------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `PermissionDialog.tsx`        | Modal dialog with hand-rolled focus trap (Tab cycle), Escape→reject, backdrop, portal | `@kobalte/core/dialog`                    | **Worked example — migrated in this commit.** Four-button verdict cluster + auto-reject timer stays in the component; Kobalte owns Root / Trigger / Portal / Overlay / Content / focus + scroll lock. |
| 2   | `ExpandedImageDialog.tsx`     | Fullscreen image preview with backdrop click-to-close, Escape, arrow-key navigation   | `@kobalte/core/dialog`                    | Arrow-key prev/next stays as window-level keydown bound to the open dialog. Backdrop button → `Dialog.Overlay`.                                                              |
| 3   | `ComposerCommandMenu.tsx`     | Anchored popover containing a filtered `role="listbox"` with custom keyboard nav     | `@kobalte/core/combobox`                  | The composer textarea drives the query; we want Combobox.Portal + Combobox.Listbox so floating positioning + keyboard nav + active-descendant ARIA come for free.            |
| 4   | `ComposerMentionMenu.tsx`     | Same shape as `ComposerCommandMenu` (mentions instead of slash commands)              | `@kobalte/core/combobox`                  | Identical pattern; consider extracting one wrapper component once both are on Kobalte.                                                                                       |
| 5   | `ProviderModelPicker.tsx`     | Trigger button + outside-click/Escape + custom `role="listbox"` of providers          | `@kobalte/core/select`                    | Single-select with current-provider preselected. `Select.Trigger` + `Select.Value` + `Select.Content` + `Select.Item` removes the manual `aria-haspopup` / `aria-expanded` / `aria-selected` wiring. |
| 6   | `ContextWindowMeter.tsx`      | `title=` attribute as tooltip                                                         | `@kobalte/core/tooltip`                   | Low priority — visible tooltips ride along with the dashboard-wide Tooltip pass.                                                                                            |

### `dashboard/src/components/`

| #   | File                               | Hand-rolled primitive                                                                  | Kobalte replacement                       | Notes                                                                                                                                                                                                                                                       |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | `CommitDialog.tsx`                 | Modal with backdrop, Escape close (implicit), busy gate                                | `@kobalte/core/dialog`                    | The header / files list / footer stays; wrap in `Dialog.Root` + `Dialog.Portal` + `Dialog.Overlay` + `Dialog.Content`. Drop the manual `onClick(target === currentTarget)` backdrop handler — `Dialog.Overlay` handles modal/non-modal semantics correctly. |
| 8   | `CreatePrModal.tsx`                | Same shape as `CommitDialog`                                                           | `@kobalte/core/dialog`                    | Identical pattern.                                                                                                                                                                                                                                          |
| 9   | `ActivityBar.tsx` → `AccountPopover` | Trigger button + outside-pointerdown + Escape + anchored absolute popover            | `@kobalte/core/popover`                   | Popover (not Dialog) — the popover is non-modal and shouldn't trap focus.                                                                                                                                                                                   |
| 10  | `ActivityBar.tsx` button tooltips  | `title=` attributes on every nav button                                                | `@kobalte/core/tooltip`                   | The component comment already calls this out ("richer floating tooltips can land with the headless-primitive pass in P3"). Replaces native `title` so the tooltips don't conflict with keyboard navigation.                                                  |
| 11  | `BranchPicker.tsx`                 | Trigger-anchored popover with full-viewport backdrop catcher (`fixed inset-0 z-30`)    | `@kobalte/core/popover`                   | Drop the manual backdrop div — Popover handles outside-click via FocusManager. Optional: `Popover.Anchor` keyed off the StatusBar git chip.                                                                                                                |
| 12  | `search/ExplorerContextMenu.tsx`   | Document-level `contextmenu` listener + Solid Portal with `role="menu"`                | `@kobalte/core/context-menu`              | Kobalte's ContextMenu is the closest match; the document-level delegation (matching `[data-testid="v2-files-row-dir"]`) stays — we only replace the menu surface itself.                                                                                  |
| 13  | `editor/LspHoverTooltip.tsx`       | Custom debounced floating overlay anchored to Monaco editor pixel coords               | `@kobalte/core/hover-card`                | HoverCard fits — controlled `open` + manual `anchorRef` for the editor-relative position. Falls back to Popover if HoverCard's portal positioning fights with Monaco's overlay layer.                                                                       |
| 14  | `StatusBar.tsx`, `CheckRunsRail.tsx`, `PushButton.tsx`, `DiffsView.tsx` | Native `title=` attributes on chips/buttons                                            | `@kobalte/core/tooltip`                   | One pass during the Tooltip rollout — same as #10.                                                                                                                                                                                                          |

### `packages/v2-solid-widgets/src/widgets/`

| #   | File                              | Hand-rolled primitive                                                                                                 | Kobalte replacement              | Notes                                                                                                                                                                                                                                                                            |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | `CommandPalette.tsx`              | Full-surface palette with input + grouped `role="listbox"` + manual keyboard nav + outside-click/Escape dismiss        | `@kobalte/core/dialog` wrapping `@kobalte/core/combobox` | Dialog handles the modal scrim + focus return; Combobox handles the typeahead + active-descendant. The widget's flatIndex/scoring logic stays — only the surface shell changes.                                                                                                  |
| 16  | `SkillsView.tsx` skill editor     | Inline `<div style={{ position: "absolute", inset: 0, … }}>` with backdrop click-to-close                              | `@kobalte/core/dialog`           | Two overlays in this file: one for the create/edit form (lines ~590–848) and one for the delete confirmation (~850+). Confirmation overlay → `@kobalte/core/alert-dialog`.                                                                                                       |
| 17  | `SkillsView.tsx` delete confirm   | Same shape, smaller card                                                                                              | `@kobalte/core/alert-dialog`     | Distinct from #16 because it asks for confirmation — `AlertDialog` enforces a default-focused action button.                                                                                                                                                                     |

## Components verified clean (no hand-rolled primitive)

Spot-checked the remaining files in the three homes (`grep -n 'role="dialog"\|role="menu"\|role="listbox"\|aria-modal\|aria-haspopup'`). The following surfaces use plain ARIA roles on flat content (lists, status banners, etc.) and **do not** need a Kobalte primitive: `ChatHeader.tsx`, `ChatThreadView.tsx`, `ProviderStatusBanner.tsx`, `ThreadErrorBanner.tsx`, `MessageCopyButton.tsx`, `MessagesTimeline.tsx`, `PlanCard.tsx`, `ToolCallCard.tsx`, `WorkingIndicator.tsx`; `Activity.tsx`, `Changes.tsx`, `CostsDashboard.tsx`, `DiffsViewer.tsx`, `Explorer.tsx`, `ExplorerDashboard.tsx`, `Inspector.tsx`, `KanbanBoard.tsx`, `MissionControlDashboard.tsx`, `PlansPanel.tsx`, `PlansRail.tsx`, `TasksView.tsx`; `editor/MergeConflictPanel.tsx`, `editor/StickyDiffEditor.tsx`, `editor/SvgRenderer.tsx`, `editor/TabStrip.tsx`, `Terminal/TerminalSurface.tsx`, `StatusBar.tsx` (chrome only — its `title=` attributes land in the Tooltip pass under #14).

## Rollout

1. **Worked example** (this commit) — `PermissionDialog` migrates to `@kobalte/core/dialog`. `@kobalte/core` is added to `packages/chat-solid/package.json` only. The dialog's behavior (four-button cluster, auto-reject timer, Escape→reject fallback, disabled-while-in-flight, `data-option-id` / `data-option-kind` / `data-variant` test hooks) is preserved verbatim — the focus trap and `aria-modal` story move from hand-rolled to Kobalte-owned.
2. **Chat-solid Dialog + Combobox migrations** — items #2–#4 land next, all inside `packages/chat-solid/`. The wire-coverage tests in `__tests__/` stay the contract: each migration is a green-test refactor, not a rewrite.
3. **Dashboard Dialog / Popover / ContextMenu pass** — items #7–#9, #11–#13. Add `@kobalte/core` to `dashboard/package.json`. Each component lands in its own commit so the diff stays reviewable.
4. **Tooltip pass** — items #6, #10, #14 in one sweep. Add `@kobalte/core` to whichever packages still need it.
5. **Widgets pass** — items #15–#17 in `v2-solid-widgets/`. Add `@kobalte/core` to `packages/v2-solid-widgets/package.json`. `CommandPalette.tsx` is the largest of the three; ship it last so the Dialog+Combobox patterns from #1–#4 are settled.

## Verification

- Component-level wire-coverage tests under `packages/chat-solid/__tests__/` (e.g. `PermissionDialog.approval.test.tsx`, `permissionDialog.test.tsx`) gate the worked example.
- `pnpm --filter @tmux-ide/chat-solid build` and `pnpm --filter @tmux-ide/chat-solid test` must stay green at every step.
- Visual smoke: run the dashboard, trigger each migrated surface, confirm focus return + Escape behavior matches the prior hand-rolled version.
