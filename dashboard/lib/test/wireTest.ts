/**
 * Wire-coverage test helper (T1).
 *
 * Closes the recurrent "shipped shell, no wire" gap that bit W2–W8 +
 * WN1–WN11: a button rendered in a Solid widget but no daemon API
 * call landed when the user clicked. The pattern:
 *
 *   1. `vi.mock("@tmux-ide/v2-solid-widgets", ...)` is intercepted by
 *      `createMockMounts()`. Every `mountX` returns a tiny handle that
 *      writes the options object into a module-singleton registry.
 *   2. Test renders the bridge. The bridge's `useEffect(() => { void
 *      import(...) })` resolves; one or two `await Promise.resolve()`
 *      ticks pump the dynamic-import promise.
 *   3. Pull the captured options via `getCaptured(name)` and invoke
 *      the handler directly — exactly as the Solid widget would.
 *   4. Assert that the captured fetch saw the expected URL / method.
 *      Or, for bridges that only forward callbacks, assert the spy
 *      was called.
 *
 * This trades widget-runtime fidelity for determinism. Solid is *not*
 * mounted, so we are not testing the widget's internal UI — only the
 * bridge's contract (which is the actual wire-up gap that bit us).
 * Widget UI behavior lives in v2-solid-widgets / chat-solid unit tests.
 *
 * See dashboard/lib/test/README.md for the full recipe.
 */

import { vi } from "vitest";

/** Module-singleton registry: shared between vi.mock factory + tests. */
const captures = new Map<string, Record<string, unknown>>();

/** Clear all captured mount options. Call this in beforeEach so prior
 *  tests don't leak state into the next render. */
export function clearCaptures(): void {
  captures.clear();
}

/** Pull the most-recently-captured mount options for a given widget.
 *  Returns `undefined` if the bridge never mounted (likely a bug). */
export function getCaptured<T = Record<string, unknown>>(key: string): T | undefined {
  return captures.get(key) as T | undefined;
}

/** Helper that builds a v2-solid-widgets-shaped module object — every
 *  `mountX` capture options into the singleton registry. Use inside
 *  `vi.mock("@tmux-ide/v2-solid-widgets", async () => (await import(...)).createMockMounts())`. */
export function createMockMounts() {
  function makeMount(key: string) {
    return (_el: HTMLElement, opts: Record<string, unknown>) => {
      captures.set(key, opts);
      return {
        unmount: () => undefined,
        setOptions: (next: Record<string, unknown>) => {
          const cur = captures.get(key) ?? {};
          captures.set(key, { ...cur, ...next });
        },
        setThreadId: (id: string) => {
          const cur = captures.get(key) ?? {};
          captures.set(key, { ...cur, threadId: id });
        },
      };
    };
  }
  return {
    mountKanbanBoard: makeMount("KanbanBoard"),
    mountPlansPanel: makeMount("PlansPanel"),
    mountTasksView: makeMount("TasksView"),
    mountSkillsView: makeMount("SkillsView"),
    mountMissionControlDashboard: makeMount("MissionControlDashboard"),
    mountCostsDashboard: makeMount("CostsDashboard"),
    mountExplorerDashboard: makeMount("ExplorerDashboard"),
    mountInspector: makeMount("Inspector"),
    mountCommandPalette: makeMount("CommandPalette"),
    mountDiffsViewer: makeMount("DiffsViewer"),
  };
}

/** chat-solid's mount handle has a slightly different shape (mount(),
 *  not mountX). Returns the module object you wire into
 *  `vi.mock("@tmux-ide/chat-solid", ...)`. */
export function createMockChatSolid(extra: Record<string, unknown> = {}) {
  const fn = (_el: HTMLElement, opts: Record<string, unknown>) => {
    captures.set("ChatSolid", opts);
    return {
      unmount: () => undefined,
      setOptions: (next: Record<string, unknown>) => {
        const cur = captures.get("ChatSolid") ?? {};
        captures.set("ChatSolid", { ...cur, ...next });
      },
      setThreadId: (id: string) => {
        const cur = captures.get("ChatSolid") ?? {};
        captures.set("ChatSolid", { ...cur, threadId: id });
      },
    };
  };
  return { mount: fn, ...extra };
}

interface FetchOkInit {
  /** JSON body returned from `.json()`. Defaults to `{}`. */
  json?: unknown;
  /** Override the response `ok` flag — useful for error-path tests. */
  ok?: boolean;
  /** Override the response `status` (defaults to 200 / 500). */
  status?: number;
}

/** Stub `globalThis.fetch` with a vitest mock that resolves to a
 *  minimal Response-shaped object. Returns the mock so the test can
 *  assert call args. Call inside the test (not at module load), since
 *  it touches the global. */
export function mockFetchOk(init: FetchOkInit = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  const json = init.json ?? {};
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Pump the microtask queue so the bridge's `await import(...)`
 *  resolves before we read the captured options. Defaults are sized
 *  for the typical bridge: 1 tick for the React commit, 1 for the
 *  `vi.mock` async factory, 1 for the dynamic `await import` inside
 *  the effect, +slack. If a bridge does additional awaited setup
 *  inside the mount-once effect (e.g. chat-solid-bridge's nested
 *  `Promise.all([api, chatSolid])`), pass a higher tick count. */
export async function flushImport(ticks = 16): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

/** Poll for a captured mount key until it appears or `timeoutMs` runs
 *  out. More robust than `flushImport()` when a bridge does multi-step
 *  awaited setup (cold module load + chained `Promise.all`). Returns
 *  the captured options. */
export async function waitForCapture<T = Record<string, unknown>>(
  key: string,
  timeoutMs = 1000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const opts = captures.get(key) as T | undefined;
    if (opts) return opts;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(
    `wireTest: mount "${key}" never captured within ${timeoutMs}ms. ` +
      `Either the bridge didn't mount, the vi.mock factory didn't run, ` +
      `or the dynamic import hasn't resolved. Captured keys so far: ` +
      `${[...captures.keys()].join(", ") || "<none>"}`,
  );
}

/** Read out the singleton — for diagnostics only; tests should use
 *  `getCaptured` to read a specific key. */
export function debugCaptures(): Record<string, unknown> {
  return Object.fromEntries(captures.entries());
}
