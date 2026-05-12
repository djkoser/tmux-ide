import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProtocol() {
  vi.resetModules();
  return import("../appProtocol");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  delete window.__TMUX_IDE__;
});

describe("appProtocol", () => {
  it("detects Electron runtime injection", async () => {
    window.__TMUX_IDE__ = { port: 7070, version: "test" };
    const { isElectron } = await loadProtocol();
    expect(isElectron()).toBe(true);
  });

  it("builds API URLs from the injected runtime port", async () => {
    window.__TMUX_IDE__ = { port: 7070, version: "test" };
    const { withApiBase } = await loadProtocol();
    expect(withApiBase("/api/sessions")).toBe("http://127.0.0.1:7070/api/sessions");
  });

  it("falls back to browser dev port and pins localhost to IPv4", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "localhost", protocol: "http:" },
    });
    vi.stubEnv("NEXT_PUBLIC_API_PORT", "6061");

    const { isElectron, withApiBase } = await loadProtocol();
    expect(isElectron()).toBe(false);
    expect(withApiBase("api/sessions")).toBe("http://127.0.0.1:6061/api/sessions");
  });

  it("resolves remote access token from the URL and persists it in sessionStorage", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "desk.local", protocol: "http:", search: "?token=tok_123" },
    });

    const { resolveAuthToken, authHeaders } = await loadProtocol();

    expect(resolveAuthToken()).toBe("tok_123");
    expect(window.sessionStorage.getItem("tmux-ide.remoteAccess.token")).toBe("tok_123");
    expect(authHeaders()).toEqual({ Authorization: "Bearer tok_123" });
  });

  it("appends the token to WebSocket URLs for remote browsers", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "desk.local", protocol: "http:", search: "?token=tok_ws" },
    });
    vi.stubEnv("NEXT_PUBLIC_API_PORT", "6061");

    const { withWsBase } = await loadProtocol();

    expect(withWsBase("/ws/events")).toBe("ws://desk.local:6061/ws/events?token=tok_ws");
  });

  it("uses the local bypass token inside Electron", async () => {
    window.__TMUX_IDE__ = { port: 7070, version: "test", localBypassToken: "local_123" };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "desk.local", protocol: "http:", search: "?token=tok_ignored" },
    });

    const { resolveAuthToken, authHeaders } = await loadProtocol();

    expect(resolveAuthToken()).toBe("local_123");
    expect(authHeaders()).toEqual({ Authorization: "Bearer local_123" });
  });
});
