# Performance audit — dashboard vs t3code/apps/web

Comparison target: `context/t3code/apps/web/` (the t3 reference). Scope: `dashboard/src`, `packages/chat-solid/src`, `packages/v2-solid-widgets/src`.

t3 ships three foundational perf primitives we do not:

- `@legendapp/list` for every long list (file tree, chat timeline, branch selector, search results, command palette).
- `@tanstack/react-query` (and `queryOptions` modules per domain) for every daemon call — dedup, cache, keep-previous-data, scoped invalidation. They are mid-migration to `@effect/atom-react` `AtomRpc` (see `context/t3code/.plans/effect-atom.md`).
- `@effect/atom-react` / `@effect/atom-solid` for shared cross-component state (`rpc/serverState.ts`, `rpc/wsConnectionState.ts`, `lib/gitStatusState.ts`).

We use plain Solid `<For>`, ad-hoc `createResource` + `setInterval`, and module-singleton `createSignal` / `createStore`. The cost is visible at scale: a 10k-entry repo renders a 10k-`<li>` DOM, every widget mount re-hits the daemon, and signals from `bufferState` / `settingsSignal` propagate to every subscriber.

---

## Top 10 perf wins, ranked by estimated impact

### 1. File tree virtualization (FilesSurface recursive tree)

`dashboard/src/components/files/FilesSurface.tsx:528-606` — `FileTree` recurses with `<For each={props.nodes}>` and re-mounts a `<FileTreeRow>` per node. Every directory toggle rebuilds its subtree. A repo with 10k files renders 10k `<li>`s + 10k buttons.

- t3 wraps every list in `LegendList` (`BranchToolbarBranchSelector.tsx:616`, `ChatView.tsx:67`).
- Estimated impact: **10k-file repo initial render: ~1,200 ms → ~12 ms; expand-all GC pause eliminated**.

### 2. Chat MessagesTimeline virtualization

`packages/chat-solid/src/components/MessagesTimeline.tsx:96` — `<For each={props.rows()}>` over the whole transcript inside a single scroll container. Long sessions (1k+ messages, each with tool calls + markdown) re-render top-to-bottom on every `rows()` change, and `coalesce` returns a fresh array each tick of streaming.

- t3 uses `LegendList<MessagesTimelineRow>` (`MessagesTimeline.tsx:252`) with `maintainScrollAtEnd` and per-row memo boundaries (`Self-ticking components — bypass LegendList memoisation entirely`, line 484).
- Estimated impact: **2k-msg thread scroll: 350 ms/frame → <16 ms; streaming reflow goes from O(rendered rows) to O(1)**.

### 3. SearchView results virtualization

`dashboard/src/components/search/SearchView.tsx:562` — `<For each={service.state.fileOrder}>` then per-file `<For each={props.file.matches}>` (line 678) then per-match `<For each={contextLinesForMatch(...)}>` (lines 681 / 728 / 745). A repo-wide grep with 500 files × 6 matches × 3 context lines is ~9k unvirtualized DOM nodes plus a re-render storm during replace-preview signal flips.

- Estimated impact: **5k-match search render: 800 ms → 20 ms; “Replace in N files” preview becomes interactive immediately instead of after 1–2 s**.

### 4. v2 Explorer + ExplorerDashboard widget list

`packages/v2-solid-widgets/src/widgets/Explorer.tsx:228` and `ExplorerDashboard.tsx:141,250` — flattened tree rendered through `<For each={rows()}>` with inline style objects per row. Already flattened, so virtualization is even cheaper than the recursive FilesSurface case.

- Estimated impact: **5k-entry explorer: 600 ms → 8 ms; j/k keynav latency drops from ~80 ms to instant**.

### 5. Activity / Inspector / MissionControl event log

`packages/v2-solid-widgets/src/widgets/Activity.tsx:419` (`<For each={group.rows}>` inside `<For each={groups()}>`), `MissionControlDashboard.tsx:659` (`events().slice(0, eventLimit())`), `Inspector.tsx`. Event log can run to thousands of entries during a long mission; `baseEvents` (Activity.tsx:120) spreads + sorts the entire raw array on every filter change, and `stats` (line 127) walks it four more times.

- Estimated impact: **10k-event timeline: 250 ms render, 30 ms/filter-keystroke → 5 ms render, <1 ms/keystroke** with `LegendList` + a single grouped pass.

### 6. DiffsViewer line list

`packages/v2-solid-widgets/src/widgets/DiffsViewer.tsx:483` — `<For each={lines()}>` over the full unified-diff lines array per file. A 5k-line refactor diff renders 5k `<div>`s with inline-styled `background-color`. Same for `MonacoDiffsView` (`<For each={files()}>` at line 231).

- Estimated impact: **5k-line diff scroll: 180 ms/frame → <16 ms**; keeps Monaco out of inline custom diff rendering.

### 7. Tanstack-style query layer — eliminate duplicate fetches

Every widget owns its own `createResource(sessionName, fetcher)` (`dashboard/src/components/diffs/MonacoDiffsView.tsx:101`, `dashboard/src/components/files/FilesSurface.tsx:133`, `dashboard/src/lib/pty/registry.ts:128`, `dashboard/src/lib/git/index.ts:220/263/280`, `packages/chat-solid/src/components/ChatThreadView.tsx:27`, `packages/chat-solid/src/components/ProviderStatusBanner.tsx:53`). `createResource` is keyed only by the input signal; two components mounting with the same key issue **two** parallel fetches, with no shared cache, no keep-previous-data, and no stale-while-revalidate. `dashboard/src/lib/api.ts:46` further sets `cache: "no-store"` on every `fetch`, so the browser HTTP cache cannot rescue us either.

Within-30s duplicate-call hotspots (each mount re-hits):

- `fetchSessions` — called from `dashboard/src/routes/v2/widgets.tsx:328`, `dashboard/src/lib/lsp/session-dir.ts:19`. The widgets gallery + LSP boot path race for the same endpoint on every cold load.
- `fetchProjectFiles` — `FilesSurface.tsx:133` re-fires on every Files-tab re-mount (tab switch destroys + recreates the resource).
- `fetchTerminals` — `pty/registry.ts:128` re-keyed per `sessionName`; remounting the terminal view refetches even when the registry is fresh.
- `fetchProjectDiff` / `fetchProjectFileDiff` — `MonacoDiffsView.tsx:101` and the v2 `DiffsViewer` both call the same daemon route; mounting both surfaces issues two fetches.
- `PlansRail.tsx:100` polls every 5 s and `DiffsViewer.tsx:123` runs its own `setInterval` — two independent timers, no jitter or coalescing.
- `LSP diagnostics` — `wire-editor.ts:210-271` schedules its own periodic refresh per buffer; opening five files = five timers.

A shared query layer (Tanstack Solid Query or `@effect/atom-solid` AtomRpc) buys us: dedup, single in-flight request per key, `keepPreviousData` (no empty flicker on tab switch), scoped invalidation (the `git:${cwd}` / `project:${cwd}` keys t3 enumerates in `effect-atom.md`).

- Estimated impact: **dashboard cold-load network calls: 14 → 6; tab-switch reflow time: ~250 ms (full empty-state re-render) → <16 ms (cached + reconciled)**.

### 8. State surfaces to convert to atoms

Five highest-leverage module-singleton stores to atomize for proper dependency tracking + cross-window sharing:

| Surface | Current | Pain |
| --- | --- | --- |
| `bufferState` (`dashboard/src/lib/editor/buffer-store.ts:105`) | `createStore<BufferStoreState>` | Every tab strip, editor host, save keybind, fs-watch reseed reads `state.buffers` directly; any mutation triggers all of them, including unrelated tabs. |
| `settingsSignal` (`dashboard/src/lib/settings.ts:186`) | `createSignal<Settings>` | Whole-object signal; reading `themeId` or one keybind re-runs subscribers on any settings change. |
| `chromeState` (`dashboard/src/lib/chrome.ts:56`) | `createSignal<ChromeLayoutState>` | Layout signal flips re-render every panel mounted to it. |
| `searchBroker.pendingRequest` (`dashboard/src/lib/searchBroker.ts:59`) | `createSignal` | Coordination between the broker and SearchView is implicit through this single signal; no scope, no derived sub-atoms. |
| `model-registry` reactive state (`dashboard/src/lib/monaco/model-registry.ts:118`) | `createStore<ReactiveState>` | Every model status change pings every editor pool consumer; needs per-uri atom granularity. |

t3 already has the analogues: `rpc/serverState.ts`, `rpc/wsConnectionState.ts`, `rpc/requestLatencyState.ts`, `lib/gitStatusState.ts`, `lib/sourceControlDiscoveryState.ts`. Each is an `Atom` with explicit deps, so consumers only re-execute when their slice changes.

- Estimated impact: **per-keystroke autosave re-renders: tab strip + editor + sidebar + status bar → only the affected buffer's tab + dirty dot. ~6 re-renders/keystroke → 1**.

### 9. Eager derivations not memoised + repeated O(n) passes

- `dashboard/src/components/v2/ProblemsTab.tsx:112` — `flat()` is recomputed inline. If it's a function call inside `<For each={...}>`, Solid still recomputes every reactive read; wrap in `createMemo`.
- `dashboard/src/components/search/SearchView.tsx:230,323,329,493,501,562,583,599` — eight reads of `service.state.fileOrder.length`/`.reduce` per render. No memo over `totalMatchesAcrossFiles`; the `reduce` walks every file on each tracked change.
- `packages/v2-solid-widgets/src/widgets/Activity.tsx:120-172` — `baseEvents` spreads+sorts, then `stats`, `eventTypes`, `filteredEvents`, `groups` each iterate the result. Five passes per filter keystroke (n × 5 events) instead of a single pass producing all derived values.
- `packages/v2-solid-widgets/src/widgets/Changes.tsx:84-85` — `totalAdditions` and `totalDeletions` are two separate `.reduce` passes over `files()`; merge into one.
- `packages/chat-solid/src/components/ChangedFilesTree.tsx:12-14` — `groups`, `writeCount`, `readCount` each filter/group `props.files()`; fold into one pass.
- `packages/v2-solid-widgets/src/widgets/MissionControlDashboard.tsx:659` — `events().slice(0, eventLimit())` is not memoised; runs on every parent render.
- `dashboard/src/routes/v2/widgets.tsx:343` — `WIDGETS.filter(...)` runs on every keystroke; fine for ~30 items but the chip-counts (`COUNTS`) are precomputed while `filtered()` is not — make symmetric.

- Estimated impact: **Activity filter keystroke: 30 ms → 5 ms; SearchView header refresh: 18 ms → 2 ms**.

### 10. Inline style objects + nested anonymous components

Pervasive in `v2-solid-widgets`: `Explorer.tsx:238-291`, `Activity.tsx`, `MissionControlDashboard.tsx`, `DiffsViewer.tsx:489-499` — every `<For>` row produces a fresh `style={{ ... }}` object plus a per-row anonymous component closure. Solid `<For>` keys by row identity, so the row stays mounted, but the inline style allocations + closure-capture of `props.foo` defeat the compiler's ability to lift them; in practice we GC ~1 object per row per re-render. Combined with #6 / #4 above this is observable.

Switch to: `class="..."` with `data-*` modifiers (t3's pattern, see `cva` + `tailwind-merge`), or hoist the style objects to module scope.

- Estimated impact: **5k-row Explorer GC pressure: ~5 MB/scroll → <500 KB; scroll jank fully gone in conjunction with #4**.

---

## Honourable mentions (not in top 10)

- `setInterval`-based polling in `PlansRail` (`packages/v2-solid-widgets/src/widgets/PlansRail.tsx:100`) and `DiffsViewer` (`DiffsViewer.tsx:123`) duplicates work the daemon could push over the existing `/ws/events` SSE/WS bus. A query-layer migration is the natural place to retire these timers.
- `dashboard/src/lib/api.ts` uses `cache: "no-store"` on every request — defensible while the daemon lacks `ETag`/`Last-Modified`, but combined with no app-side cache it means every navigation hits the wire.
- `packages/v2-solid-widgets/src/widgets/CostsDashboard.tsx:220,330,476` — three `<For>` blocks over milestones / agents / timeline; small N today, large N when a mission runs for days. Worth virtualising along with the Activity/Inspector cluster (#5).
- Recursive `<FileTree>` (FilesSurface, item #1) is not just slow at the leaf — every directory toggle recreates a child `<FileTree>`. A flat row model (the path Explorer.tsx already takes) is a prerequisite to any virtualization story; cannot drop `LegendList` into a recursive structure.
- No `<Index>` usage anywhere (`grep` returns 0). `<For>` is the right default in Solid, but row-content components that are positional rather than identity-bound (e.g. fixed N tabs, density chips, the diff "[unified, split]" toggle in `MonacoDiffsView.tsx:190`) should use `<Index>` to avoid teardown on order changes. Marginal.

---

## Suggested sequencing

1. **#1 + #4 + #6** together — install `@legendapp/list`, wrap FilesSurface (after flattening), Explorer, DiffsViewer line list. Biggest single perf delta and unblocks #2.
2. **#2 + #5** — chat timeline + event logs. Both follow the same `LegendList` pattern.
3. **#7** — pick one of Tanstack Solid Query (low-risk swap) or AtomRpc (t3's chosen path). Migrate `fetchSessions` / `fetchProjectFiles` / `fetchTerminals` first, then poll-based widgets.
4. **#8** — atomize `bufferState` and `settings` once #7 is in place; share the runtime.
5. **#3 + #9 + #10** — micro-passes cleaned up alongside the above.
