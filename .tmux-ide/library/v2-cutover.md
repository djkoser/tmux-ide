# v2 Cutover — Feature-Flagged Root Redirect

This file documents the G4 cutover plan: making the v2 shell reachable at `/`
behind a feature flag, with rollback instructions and a per-surface canonical
source-of-truth list. The cutover is **non-destructive** — the v1 shell at
`(shell)/` and its routes still work whether the flag is on or off.

## Mechanism

`dashboard/app/(shell)/page.tsx` is the root route handler. It checks two
inputs and redirects `/` → `/v2` when either is truthy. Otherwise it returns
`null`, which is the existing v1 behavior (NavigationState in `AppShell`
chooses what to render).

| Source     | Value                | Result               |
| ---------- | -------------------- | -------------------- |
| Env var    | `NEXT_PUBLIC_V2_ROOT=true` | Redirect `/` → `/v2` |
| Query      | `?v2=1` or `?v2=true`     | Redirect `/` → `/v2` |
| Neither    | (unset / any other)       | v1 root, no redirect |

The env var wins for a default-state cutover (sticky for everyone hitting
`/`). The query param is the override for ad-hoc testing without needing to
change env config — useful for QA and bug reports ("does it repro at
`/?v2=1`?").

`NEXT_PUBLIC_*` is the Next.js client-readable prefix; here it's read in a
server component so the prefix is not strictly required, but kept for
forward-compat if other client components want to gate on the same flag.

## Enable

### Local dev

```bash
# In dashboard/.env.local (create if absent):
NEXT_PUBLIC_V2_ROOT=true
```

Then restart the Next.js dev server. Hitting `http://localhost:3000/` will
303-redirect to `/v2`.

### Per-request override (no restart needed)

Append `?v2=1` to any URL pointing at `/`. Example:
`http://localhost:3000/?v2=1`. This redirects the single request to `/v2`
without touching the env state.

### Production

Set `NEXT_PUBLIC_V2_ROOT=true` in the deployment environment variables.

## Roll back

### Disable the cutover

Remove or set `NEXT_PUBLIC_V2_ROOT` to anything other than the literal
string `true` (e.g. `false`, `0`, unset). Restart. `/` returns to v1
behavior immediately. No file edits, no migrations, no data loss.

### If `/v2` itself is broken

The v1 shell continues to work at `/`. Users who land at `/?v2=1` will be
redirected to a broken `/v2`, but a plain `/` (after env disabled) is the
escape hatch. Nothing v1 depends on `/v2` being healthy.

### Code-level revert

`dashboard/app/(shell)/page.tsx` is the single touch point. Reverting it
to the previous `function OverviewRoute() { return null; }` body removes
the cutover hook entirely. The `/v2` route, ProjectV2Page, and v2 shell
chrome remain in place — only the root-level redirect goes away.

## Surface canonicality

As of this cutover, here's where each user-facing surface is canonical
(authoritative) versus still-v1:

### v2-canonical

- `/v2` — overview shell (sessions list, projects table, inspector)
- `/v2/project/[name]` — project view with mission / kanban / tasks /
  plans / skills / diffs / changes / preview / metrics tabs
- `/v2/widget/[name]` — PTY-mirror foundation for OpenTUI widgets
  (explorer, mission-control etc.; see T007)
- ProjectV2Page is the rendering target for the redirected `/`

### Still v1 (no v2 equivalent yet)

- `/terminal/[id]` — terminal session detail route
- `/(shell)/project/[name]` — v1 project route (kept for direct deep links)
- `/tui-demo` — kitchen-sink page for the TUI primitive library
- AppShell's tab/navigator system (used by v1 root) — not yet ported
- Validation, ContextBar, ToastStack, SaveIndicator, AppSidebar — wired
  inside `(shell)/layout.tsx` chrome only

When the flag is **on**, users hitting `/` go straight to `/v2`. Direct
links to `/(shell)/project/...` still resolve through the v1 layout (they
do not flow through the `/` redirect).

## Open follow-ups (not blockers)

- Ship `T012a` adapter so `ui/sidebar.tsx` consumers can move off
  `@base-ui/react` without a 9-file migration in one shot.
- `T015a/b` — wire stage/unstage server endpoints behind the new
  Changes view (currently read-only).
- Delete `(shell)/` once every v1-canonical surface has a v2 replacement
  and the redirect has been default-on for a release without regressions.
