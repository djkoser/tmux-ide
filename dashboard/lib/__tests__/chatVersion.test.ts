import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_V1_BANNER_TEXT,
  OLD_CHAT_STORAGE_KEY,
  resolveChatVersion,
  resolveChatVersionFromBrowser,
} from "@/lib/chatVersion";

/**
 * T080 — feature-flag cutover.
 *
 * `resolveChatVersion` is the single source of truth for which chat UI a
 * project lands on. The dashboard's V2ChatView delegates to it, so these
 * unit tests double as the contract V2ChatView relies on.
 */
describe("feature-flag-cutover :: resolveChatVersion (pure)", () => {
  it("(a) default route lands on new UI when nothing else is set", () => {
    expect(resolveChatVersion()).toBe("v2");
    expect(resolveChatVersion({ search: "" })).toBe("v2");
    expect(resolveChatVersion({ search: "?other=1" })).toBe("v2");
  });

  it("(b) ?chat=v1 lands on old UI — URL is the explicit override", () => {
    expect(resolveChatVersion({ search: "?chat=v1" })).toBe("v1");
    expect(resolveChatVersion({ search: "?foo=bar&chat=v1" })).toBe("v1");
    expect(resolveChatVersion({ search: "?chat=v1&other=2" })).toBe("v1");
  });

  it("?chat=v2 stays on the new UI even when the settings toggle would force v1", () => {
    expect(resolveChatVersion({ search: "?chat=v2", useOldChat: true })).toBe("v2");
  });

  it("(c) settings toggle resolves to v1 when no URL param is present", () => {
    expect(resolveChatVersion({ useOldChat: true })).toBe("v1");
    expect(resolveChatVersion({ search: "", useOldChat: true })).toBe("v1");
  });

  it("URL param wins over the settings toggle in both directions", () => {
    expect(resolveChatVersion({ search: "?chat=v1", useOldChat: false })).toBe("v1");
    expect(resolveChatVersion({ search: "?chat=v2", useOldChat: true })).toBe("v2");
  });

  it("invalid ?chat=… values fall back to the default precedence", () => {
    expect(resolveChatVersion({ search: "?chat=v3" })).toBe("v2");
    expect(resolveChatVersion({ search: "?chat=" })).toBe("v2");
    expect(resolveChatVersion({ search: "?chat=v3", useOldChat: true })).toBe("v1");
  });

  it("banner copy is the contract text (no surprise renames)", () => {
    expect(CHAT_V1_BANNER_TEXT).toMatch(
      /Chat v1 will be removed in the next release/,
    );
    expect(CHAT_V1_BANNER_TEXT).toContain("github.com/wavyrai/tmux-ide/issues");
  });
});

describe("feature-flag-cutover :: resolveChatVersionFromBrowser", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  function setSearch(search: string): void {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search },
    });
  }

  it("default browser env (no URL param, no storage) → v2", () => {
    setSearch("");
    expect(resolveChatVersionFromBrowser()).toBe("v2");
  });

  it("?chat=v1 in URL → v1", () => {
    setSearch("?chat=v1");
    expect(resolveChatVersionFromBrowser()).toBe("v1");
  });

  it("localStorage flag set → v1 even with empty URL", () => {
    setSearch("");
    window.localStorage.setItem(OLD_CHAT_STORAGE_KEY, "true");
    expect(resolveChatVersionFromBrowser()).toBe("v1");
  });

  it("localStorage flag set + ?chat=v2 → URL wins → v2", () => {
    setSearch("?chat=v2");
    window.localStorage.setItem(OLD_CHAT_STORAGE_KEY, "true");
    expect(resolveChatVersionFromBrowser()).toBe("v2");
  });

  it("survives localStorage throwing — falls back to URL-only path", () => {
    setSearch("?chat=v1");
    const throwing = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    expect(resolveChatVersionFromBrowser()).toBe("v1");
    throwing.mockRestore();
  });
});
