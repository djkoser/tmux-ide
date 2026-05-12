# /v2 cutover — rollback procedure

When the `/v2` shell takes over the default route, this document is the
recipe for backing it out. Use it whenever a regression in `/v2`
warrants serving the legacy `(shell)` route from `/` again. The
rollback is feature-flag-driven and reversible — no code changes are
required for the standard rollback.

> **Scope** — this covers rolling back the _route flip_ (default `/`
> serves which shell), not the underlying widget ports. The native
> React widget surfaces under `/v2/*` stay live in either configuration.

---

## 1. Flip the feature flag off

The cutover is implemented behind a feature flag. The flag name and
mechanism depend on what the cutover-implementing agent landed —
verify in `dashboard/middleware.ts`, `dashboard/next.config.mjs`, or
the root `app/page.tsx` redirect — but the typical shapes are:

- **Env var** — `NEXT_PUBLIC_TMUX_IDE_V2=on` (set on the dashboard
  process). To roll back: unset the variable (or set to `off`) and
  restart the dev server / rebuild for prod.

  ```bash
  # dev
  unset NEXT_PUBLIC_TMUX_IDE_V2
  pnpm --filter dashboard dev

  # prod (next build is static-export — see next.config.mjs `output: "export"`)
  cd dashboard && rm -rf out && pnpm build
  ```

- **Middleware redirect** — if `dashboard/middleware.ts` rewrites `/`
  to `/v2`, comment out or guard the rewrite block, then rebuild.
- **Root-route redirect** — if `app/page.tsx` calls `redirect("/v2")`,
  remove the redirect and restore the legacy entry (e.g. re-render
  the `(shell)` content or `redirect("/(shell)")`).

After the flag is off, hit `http://localhost:6061/` (default dashboard
port) and confirm the legacy `(shell)` AppShell renders, not the v2
overview.

If the flag mechanism is the env var route, `tmux-ide` operators on
remote machines may need a `tmux-ide` process restart (the
command-center serves the dashboard from `dashboard/out/` for
production builds). Document the actual mechanism inline at cutover
time so on-call doesn't have to grep at 3am.

---

## 2. Audit screens that may have v2-only state

`/v2` writes a small set of localStorage keys that the legacy shell
does not read. They are not destructive — leaving them in place is
safe — but the audit matters when (a) a user sees stale layout after
rollback, or (b) you want to confirm the rollback didn't strand
unflushed state.

Known `/v2` localStorage keys (as of 2026-05-07):

| Key pattern                                | Source                                                       | What it stores                                            |
| ------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| `tmux-ide.v2.layout.v1.overview-h`         | `app/v2/_lib/useStoredLayout.ts` (used by `app/v2/page.tsx`) | Horizontal panel sizes on the v2 overview                 |
| `tmux-ide.v2.layout.v1.overview-v`         | same                                                         | Vertical panel sizes on the v2 overview                   |
| `tmux-ide.v2.layout.v1.project-h`          | `app/v2/project/[name]/ProjectV2Page.tsx`                    | Horizontal panel sizes on the v2 project view             |
| `tmux-ide.v2.layout.v1.project-v`          | same                                                         | Vertical panel sizes on the v2 project view               |
| `tmux-ide:preview:last-path:<projectName>` | `app/v2/project/[name]/ProjectV2Page.tsx` Preview view       | Per-project last-opened file path for the Preview surface |

**To re-discover this list at rollback time** (in case the file changes):

```bash
grep -rE "localStorage\.(setItem|getItem|removeItem)" \
  --include='*.tsx' --include='*.ts' \
  dashboard/app/v2 dashboard/components | grep -v node_modules
```

**Audit steps:**

1. Confirm the legacy `(shell)` does not read these keys: `grep -r "tmux-ide.v2.layout\|tmux-ide:preview" dashboard/app/\(shell\) dashboard/components` should return no hits. If any hit, that's a coupling bug — file an issue before rolling back.
2. The keys can stay in browser storage. They will be re-honoured if/when `/v2` is re-enabled.
3. If a user reports stale UI (unlikely — keys are namespaced), the documented manual fix is:
   ```js
   // in browser DevTools console
   for (const key of Object.keys(localStorage)) {
     if (key.startsWith("tmux-ide.v2") || key.startsWith("tmux-ide:preview")) {
       localStorage.removeItem(key);
     }
   }
   ```

**Other v2-only state to audit at cutover time** (extend this list as new
v2 surfaces land):

- Cookies set by v2-only code paths (`document.cookie` writes).
- IndexedDB / Cache API entries opened by v2 service workers (none today, but check before each cutover).
- Server-side state: command-center endpoints added for v2 (`/api/project/:name/preview/:file`, `/api/project/:name/config`, `/api/project/:name/restart`) are also consumed by the v2 widget routes themselves and are safe to leave live; legacy shell ignores them.

---

## 3. Confirm legacy `(shell)` still routes correctly

After the flag is off:

```bash
# 1. Build & boot the dashboard
cd dashboard
pnpm install --frozen-lockfile  # only if deps changed
pnpm dev   # or `pnpm build && tmux-ide command-center` for prod

# 2. Walk these URLs in a fresh incognito window:
#    /              → must render the legacy AppShell (NavigationState-driven tabs)
#    /project/<name>→ legacy project page
#    /terminal/<id> → legacy terminal route
#    /v2            → still reachable, still renders v2 overview (rollback does NOT remove /v2)
#    /v2/project/<name>, /v2/config, /v2/setup, /v2/widget/<name> → still reachable

# 3. Programmatic smoke check
curl -fsS http://localhost:6061/ -o /dev/null && echo "root ok"
```

The legacy `(shell)/page.tsx` deliberately returns `null` (Phase Z
URL-persistence-only routing — view selection lives in
`NavigationState` rendered by `MainTabContent` inside `AppShell`). If
`/` shows a blank screen, that's expected — the AppShell renders
through `(shell)/layout.tsx`, not the page module. If the AppShell
itself fails to render, that's a regression — capture a console
trace and a screenshot before continuing.

---

## 4. Sanity-check tests still pass

Run the standard quality gates from the repo root:

```bash
# Workspace-wide
pnpm check              # = lint + format + typecheck + test:unit + docs:build + pack:check

# Targeted runs if `pnpm check` is too slow during a hotfix:
pnpm typecheck          # Bun-based src/ typecheck
pnpm test:unit          # excludes integration
pnpm test:dashboard     # vitest run inside dashboard/
cd dashboard && pnpm exec tsc --noEmit  # dashboard-only TS gate
cd dashboard && pnpm lint
```

Baseline: dashboard `tsc --noEmit` should report **10 known
pre-existing errors** (in `lib/api.ts`, `lib/__tests__/api.test.ts`,
`lib/__tests__/support.ts`, `components/tui/DataTable.tsx`,
`components/settings/RemoteAccessPanel.tsx`). A higher count after
rollback means the rollback itself regressed something — investigate
before declaring rollback complete.

If `pnpm check` fails on `pack:check` only and the failure is a stale
`out/` artefact, run `cd dashboard && rm -rf out && pnpm build`
before re-running.

---

## 5. Verification checklist before re-enabling cutover

When the underlying issue is fixed and you're ready to flip the flag
back on:

- [ ] **Reproduction** — the original regression is reproducible on
      `main`-without-the-fix and **fixed** on the candidate commit. Don't
      re-cutover without proving the regression is dead.
- [ ] **Tests** — `pnpm check` passes from clean. dashboard `tsc
--noEmit` count is at the baseline (10 today; update this
      document if the baseline changes).
- [ ] **Local walk-through** — with flag on, hit:
  - `/` (v2 overview)
  - `/project/<name>` _(if v2 redirects this URL)_ / `/v2/project/<name>`
  - `/v2/config` — load config, edit a field, Save, Restart
  - `/v2/project/<name>` — Mission, Kanban, Tasks, Plans, Skills,
    Diffs, **Preview** (test the Content/Diff toggle), **Metrics**
    (verify per-agent rows render)
  - Terminal route
  - Command palette (`⌘K`), terminal toggle (`⌘J`), sidebar toggle (`⌘\`)
- [ ] **localStorage compat** — open DevTools, confirm no errors
      during hydration on a fresh profile (no pre-existing `tmux-ide.v2.*`
      keys) **and** on a profile that has stale keys from a prior `/v2`
      session.
- [ ] **API endpoints** — confirm command-center is on a version that
      exposes the v2-required endpoints:
  - `GET /api/project/:name/metrics`
  - `GET /api/project/:name/preview/:file{.+}`
  - `GET /api/project/:name/config`
  - `POST /api/project/:name/config`
  - `POST /api/project/:name/restart`
- [ ] **Rollback rehearsal** — flip the flag off in a test environment
      and confirm the legacy shell still renders. This catches the
      "couldn't roll back even if we wanted to" failure mode early.
- [ ] **Comms** — drop a note in the team channel before flipping; if
      this is a re-cutover after a regression, link the post-mortem.

If any box stays unchecked, do not re-cutover.

---

## Open items / drift watch

Update this document whenever any of the below change, otherwise
rollback drifts from reality:

- The feature-flag mechanism (env var name, middleware path, redirect site).
- The list of v2-specific localStorage keys (run the grep above).
- The legacy `(shell)/page.tsx` behaviour (currently a deliberate
  `return null` — if it gets brought back, remove that note from
  section 3).
- The dashboard `tsc --noEmit` baseline count.
- The set of v2-required command-center endpoints.

When the cutover lands, the cutover PR should also update this doc
with the actual feature-flag mechanism it shipped.
