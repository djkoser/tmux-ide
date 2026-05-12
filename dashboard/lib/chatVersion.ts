/**
 * Resolves which chat UI to render — the new t3-style ChatV2Root, or the
 * legacy Solid-island UI. Resolution order (first hit wins):
 *
 *   1. `?chat=v1` or `?chat=v2` in the URL  — explicit override
 *   2. localStorage `tmux-ide:use-old-chat=true` — settings escape hatch
 *   3. Default → `"v2"` (the new UI is the default since T080)
 *
 * Pure function so component tests can stub `window` and exercise every
 * branch without React state.
 */
export type ChatVersion = "v1" | "v2";

export const OLD_CHAT_STORAGE_KEY = "tmux-ide:use-old-chat";

export const CHAT_V1_BANNER_TEXT =
  "Chat v1 will be removed in the next release — switch back if you hit any issues. Report issues at github.com/wavyrai/tmux-ide/issues";

export interface ResolveChatVersionInput {
  /** URL search string, e.g. `"?chat=v1"`. Pass `window.location.search`. */
  search?: string;
  /** `true` when the settings toggle is on. */
  useOldChat?: boolean;
}

export function resolveChatVersion(input: ResolveChatVersionInput = {}): ChatVersion {
  const param = new URLSearchParams(input.search ?? "").get("chat");
  if (param === "v1") return "v1";
  if (param === "v2") return "v2";
  if (input.useOldChat) return "v1";
  return "v2";
}

/**
 * Browser-side variant — reads `window.location.search` and localStorage
 * directly. Returns `"v2"` during SSR (no window).
 */
export function resolveChatVersionFromBrowser(): ChatVersion {
  if (typeof window === "undefined") return "v2";
  let useOldChat = false;
  try {
    useOldChat = window.localStorage?.getItem(OLD_CHAT_STORAGE_KEY) === "true";
  } catch {
    // localStorage unavailable (private mode / SSR shim) — fall back to URL only.
  }
  return resolveChatVersion({
    search: window.location.search,
    useOldChat,
  });
}
