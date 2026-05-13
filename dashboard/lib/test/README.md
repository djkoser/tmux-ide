# Wire-coverage test pattern

Lives under `dashboard/lib/test/wireTest.ts`. Used by every
`dashboard/components/__tests__/*.wire.test.tsx` to guard the single
recurrent bug class that bit W2–W8 and WN1–WN11: a button rendered in a
Solid widget but **no daemon API call landed** when the user clicked.

Each Solid bridge is the thin React-side wrapper that
`await import("@tmux-ide/v2-solid-widgets")`s the widget, hands it a
mount-options object, and forwards user events (callbacks) back through
the daemon REST API.

This test pattern asserts that the callbacks the bridge passes into
the mount actually issue the expected `fetch` call — without standing
up the Solid runtime.

---

## Recipe

```tsx
// dashboard/components/__tests__/kanban-board-bridge.wire.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  flushImport,
  getCaptured,
  mockFetchOk,
} from "@/lib/test/wireTest";
import { KanbanBoardBridge } from "@/components/kanban-board-bridge";

vi.mock("@tmux-ide/v2-solid-widgets", async () => {
  const { createMockMounts } = await import("@/lib/test/wireTest");
  return createMockMounts();
});

beforeEach(() => clearCaptures());
afterEach(() => vi.unstubAllGlobals());

describe("KanbanBoardBridge — wire", () => {
  it("onTaskStatusChange POSTs to /api/project/:name/task/:id", async () => {
    const fetchMock = mockFetchOk({ json: { task: { id: "t1", status: "done" } } });
    render(<KanbanBoardBridge sessionName="proj" tasks={[]} goals={[]} />);
    await flushImport();

    const opts = getCaptured<{
      onTaskStatusChange: (id: string, status: string) => Promise<void>;
    }>("KanbanBoard")!;
    await opts.onTaskStatusChange("t1", "done");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/project/proj/task/t1"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
```

---

## Helper API

`@/lib/test/wireTest` exports:

| Export                     | Purpose                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMockMounts()`       | Mocked `@tmux-ide/v2-solid-widgets` module: every `mountX` writes the options object into a singleton registry.                                             |
| `createMockChatSolid(...)` | Same shape for `@tmux-ide/chat-solid` (uses `mount`, not `mountX`).                                                                                         |
| `getCaptured(key)`         | Returns the most-recently-captured mount options for a widget. Keys: `KanbanBoard`, `PlansPanel`, `TasksView`, `SkillsView`, `Inspector`, `ChatSolid`, etc. |
| `clearCaptures()`          | Reset the registry. Call in `beforeEach`.                                                                                                                   |
| `mockFetchOk({ json })`    | Stub global fetch with a Response-shaped mock. Returns the mock for assertions.                                                                             |
| `flushImport(ticks?)`      | Pump microtasks so the bridge's `await import(...)` resolves before reading captures.                                                                       |
| `debugCaptures()`          | Diagnostics dump.                                                                                                                                           |

---

## Why mock the mount instead of rendering the Solid widget

The bug class this targets is _**the bridge forgot to wire a handler**_,
not _**the widget's button doesn't render**_. Solid rendering inside
React + vitest + happy-dom is slow, brittle, and bloats this suite
beyond what `pnpm test` should run on every save.

Widget-level UI behavior (button renders, click fires handler) is
covered by `packages/v2-solid-widgets/__tests__/*.test.tsx` and
`packages/chat-solid/__tests__/*` — those tests _do_ mount the Solid
widget in isolation and assert DOM behaviour.

This test pattern slots between the two: it asserts the contract
between the React bridge and the widget's mount options is respected.

---

## When to add a new wire test

Every time you add an action handler (`onX`) to a bridge's mount
options object. The discipline is one test per primary user action:

- a daemon-mutating click (POST/PUT/DELETE) — assert the fetch URL +
  method.
- a callback-forwarded click — assert the parent's spy was invoked.
- a URL-navigation click — assert `window.location` or a `popstate`
  event.

If you can't write the test in this pattern, the bridge probably
shouldn't have the handler — push the wire-up out to the host.
