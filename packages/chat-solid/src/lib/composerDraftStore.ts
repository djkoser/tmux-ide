/**
 * Composer draft persistence — keeps in-flight prompt text alive across
 * page reloads. Adapted from t3code's composerDraftStore.ts but stripped
 * to the text-only essentials (we don't yet persist provider / model /
 * attachment selection).
 *
 * API:
 *   loadDraft(threadId)  → current prompt for this thread, or "".
 *   saveDraft(threadId, prompt) — debounced ~250ms, coalesces keystrokes.
 *   clearDraft(threadId) — call on successful send.
 *   flushDrafts() — synchronous write; auto-fires on `beforeunload`.
 *
 * Storage shape:
 *   localStorage["tmux-ide:composer:drafts:v1"] = JSON({
 *     [threadId]: { prompt: string, updatedAt: number },
 *     ...
 *   })
 *
 * Notes:
 * - Empty prompts are removed from storage so the map stays compact.
 * - threadId "" or null is treated as a no-op (pre-thread drafts not yet
 *   modeled — see t3's DraftSessionState if we ever need that).
 * - In SSR / non-browser contexts the store degrades to an in-memory map,
 *   so callers don't need to guard `typeof window`.
 */

const STORAGE_KEY = "tmux-ide:composer:drafts:v1";
const FLUSH_DEBOUNCE_MS = 250;

interface DraftEntry {
  prompt: string;
  updatedAt: number;
}

type DraftMap = Record<string, DraftEntry>;

let cached: DraftMap | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let unloadListenerInstalled = false;

function hasLocalStorage(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readFromStorage(): DraftMap {
  if (cached) return cached;
  if (!hasLocalStorage()) {
    cached = {};
    return cached;
  }
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as DraftMap) : {};
  } catch {
    cached = {};
  }
  return cached;
}

function writeToStorageNow(): void {
  if (!dirty) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  dirty = false;
  if (!hasLocalStorage()) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached ?? {}));
  } catch {
    // quota errors / private mode — swallow; the in-memory cache still serves
    // this session, and the next save attempt will retry.
  }
}

function scheduleFlush(): void {
  dirty = true;
  installUnloadListener();
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    writeToStorageNow();
  }, FLUSH_DEBOUNCE_MS);
}

function installUnloadListener(): void {
  if (unloadListenerInstalled) return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  unloadListenerInstalled = true;
  // Use `pagehide` (more reliable on mobile + bfcache) AND `beforeunload`.
  const onLeave = () => writeToStorageNow();
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("beforeunload", onLeave);
}

export function loadDraft(threadId: string | null | undefined): string {
  if (!threadId) return "";
  return readFromStorage()[threadId]?.prompt ?? "";
}

export function saveDraft(threadId: string | null | undefined, prompt: string): void {
  if (!threadId) return;
  const store = readFromStorage();
  if (!prompt) {
    if (!(threadId in store)) return;
    delete store[threadId];
  } else {
    store[threadId] = { prompt, updatedAt: Date.now() };
  }
  scheduleFlush();
}

export function clearDraft(threadId: string | null | undefined): void {
  if (!threadId) return;
  const store = readFromStorage();
  if (!(threadId in store)) return;
  delete store[threadId];
  scheduleFlush();
}

export function flushDrafts(): void {
  writeToStorageNow();
}

/** Test-only: clear in-memory + persisted state so suites don't leak. */
export function __resetComposerDraftStoreForTests(): void {
  cached = null;
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (hasLocalStorage()) {
    try {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export const __STORAGE_KEY_FOR_TESTS = STORAGE_KEY;
export const __FLUSH_DEBOUNCE_MS_FOR_TESTS = FLUSH_DEBOUNCE_MS;
