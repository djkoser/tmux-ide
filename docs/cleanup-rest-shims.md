# Cleanup audit — legacy `/api/threads/...` REST shims

Per [ARCHITECTURE.md §7.2 item 8](../ARCHITECTURE.md#72--medium-value--medium-risk).

Background: [ARCHITECTURE.md §4.1](../ARCHITECTURE.md#41--action-contract-http) — all writes now flow through `POST /api/v2/action/:name`. The `/api/threads/...` REST family in `packages/daemon/src/command-center/server.ts` predates that contract. `chat-solid` performs thread CRUD via `chat.thread.*` actions (`chat.thread.list`, `.create`, `.delete`, `.rename`, `.setProvider`, `.get`, `.usage`) — see `packages/chat-solid/src/api.ts`.

This document **lists** the shims and recommends a disposition. **No routes deleted yet.**

## Inventory

| #   | Route                                          | Method | server.ts line | In `contracts/src/routes.ts`? | Production callers in `dashboard/` or `chat-solid/`        | Test coverage                                                                  | Recommendation                                                                                                                   |
| --- | ---------------------------------------------- | ------ | -------------- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/api/threads`                                 | GET    | 787            | no                            | none — superseded by action `chat.thread.list`             | `daemon/src/chat/chat-integration.test.ts:2106` (T082 wiring test)             | **Safe to delete** after dropping the T082 wiring test (or rewriting it to exercise the action handler).                         |
| 2   | `/api/threads`                                 | POST   | 792            | no                            | none — superseded by action `chat.thread.create`           | `daemon/src/chat/chat-integration.test.ts:2106`                                | **Safe to delete** — same condition as #1.                                                                                       |
| 3   | `/api/threads/:threadId`                       | GET    | 804            | no                            | none — superseded by action `chat.thread.get`              | `daemon/src/chat/chat-integration.test.ts:2181`                                | **Safe to delete** — same condition as #1.                                                                                       |
| 4   | `/api/threads/:threadId`                       | DELETE | 812            | no                            | none — superseded by action `chat.thread.delete`           | `daemon/src/chat/chat-integration.test.ts:2138, 2171` (b: cascade delete test) | **Safe to delete** — the cascade-clear behavior (sessions + checkpoints) lives in the action handler too; verify before removal. |
| 5   | `/api/threads/:threadId/plans`                 | GET    | 837            | yes (`threads.plans.list`)    | `packages/chat-solid/src/api.ts:259` (`fetchThreadPlans`)  | `daemon/src/chat/__tests__/plan-routes.test.ts:74`                             | **Keep.** Still load-bearing; no `chat.thread.plans.*` action replacement exists yet.                                            |
| 6   | `/api/threads/:threadId/plans/:planId/approve` | POST   | 845            | yes (`threads.plans.approve`) | `packages/chat-solid/src/api.ts:275` (`approveThreadPlan`) | `daemon/src/chat/__tests__/plan-routes.test.ts:83`                             | **Keep** — same as #5.                                                                                                           |
| 7   | `/api/threads/:threadId/plans/:planId/reject`  | POST   | 876            | yes (`threads.plans.reject`)  | `packages/chat-solid/src/api.ts:304` (`rejectThreadPlan`)  | `daemon/src/chat/__tests__/plan-routes.test.ts`                                | **Keep** — same as #5. (If we promote plans to actions later, audit #5–#7 together.)                                             |

## Supporting evidence

Searched for active callers with:

```
grep -rn "/api/threads" packages/chat-solid/src packages/contracts/src dashboard/src \
  | grep -v node_modules | grep -v dist | grep -v coverage
```

Result: only `packages/chat-solid/src/api.ts` (plans GET/approve/reject) and a comment in `packages/chat-solid/src/types.ts` referencing the old REST delete path (stale comment — chat-solid uses `chat.thread.delete` now). No `dashboard/src` hits.

The legacy comment in `server.ts:778-781` claims "the v2 chat UI (`dashboard/app/v2/_lib/V2ChatView.tsx` + `components/chat/NewChatPicker.tsx`) talks directly to these routes" — both files no longer exist (`find dashboard packages -name "V2ChatView*" -o -name "NewChatPicker*"` returns nothing under `src/`). That paragraph is itself stale.

## Action items (do NOT do in this commit — produce the list only)

1. **Rows #1–#4 (`/api/threads` CRUD):** drop the four handlers in `server.ts:787–827`, the stale comment block `server.ts:778–786`, and either delete or rewrite the T082 wiring tests in `chat-integration.test.ts` (currently lines ~2100–2200). Confirm the action-handler counterparts cover the cascade-clear behavior covered by row #4's test before removal.
2. **Rows #5–#7 (plan routes):** leave alone for now. When a future contract introduces `chat.plan.*` actions, migrate `chat-solid/src/api.ts:259/275/304` to `postAction(...)` calls in one commit, then retire these three routes and their `routes.ts` entries together.
3. **Stale comment cleanup:** also fix the doc-comment at `server.ts:254` (`Chat stores backing /api/threads and /api/chat/providers …`) — once #1–#4 are gone, only `/api/chat/providers` remains.
4. **Stale comment in `chat-solid/src/types.ts:270`:** drop the `DELETE /api/threads/:id` reference; deletion runs through `chat.thread.delete` now.

## Out of scope

- `/api/chat/providers` (provider discovery) — separate concern, still load-bearing.
- `/api/providers` (provider instance store, T080) — separate concern.
- Other REST-shaped legacy endpoints called out in [ARCHITECTURE.md §4.1](../ARCHITECTURE.md#41--action-contract-http) (`/api/sessions`, `/api/project/:name/files`, `/api/project/:name/lsp/*`, …) — those serve large reads / stream files and are intentionally non-action.
