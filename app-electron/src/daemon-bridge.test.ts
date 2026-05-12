import { describe, expect, it, vi } from "vitest";
import type { CanonicalDaemonInfo, EmbeddedDaemonHandle } from "@tmux-ide/daemon";
import { attachOrStartDaemon, makeExternalDaemonHandle } from "./daemon-bridge.ts";

function info(overrides: Partial<CanonicalDaemonInfo> = {}): CanonicalDaemonInfo {
  return {
    pid: 12345,
    port: 6060,
    version: "0.0.1",
    startedAt: "2026-05-11T10:00:00.000Z",
    bindHostname: "127.0.0.1",
    authToken: "secret-token",
    ...overrides,
  };
}

function fakeEmbedded(port: number): EmbeddedDaemonHandle {
  return {
    port,
    apiBaseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    localBypassToken: "embedded-token",
    activateProject: async () => ({ stop: async () => undefined }),
    stop: async () => undefined,
  };
}

describe("attachOrStartDaemon", () => {
  it("attaches to an alive canonical daemon without embedding", async () => {
    const embed = vi.fn();
    const handle = await attachOrStartDaemon({
      readInfo: () => info(),
      isAlive: async () => true,
      embed,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(handle.port).toBe(6060);
    expect(handle.apiBaseUrl).toBe("http://127.0.0.1:6060");
    expect(handle.localBypassToken).toBe("secret-token");
  });

  it("falls back to embedded when no canonical info is on disk", async () => {
    const expected = fakeEmbedded(7070);
    const embed = vi.fn().mockResolvedValue(expected);
    const handle = await attachOrStartDaemon({
      readInfo: () => null,
      isAlive: async () => true,
      embed,
    });
    expect(embed).toHaveBeenCalledOnce();
    expect(handle).toBe(expected);
  });

  it("falls back to embedded when the canonical daemon is dead", async () => {
    const expected = fakeEmbedded(7071);
    const embed = vi.fn().mockResolvedValue(expected);
    const handle = await attachOrStartDaemon({
      readInfo: () => info(),
      isAlive: async () => false,
      embed,
    });
    expect(embed).toHaveBeenCalledOnce();
    expect(handle).toBe(expected);
  });

  it("forces embed when forceEmbed is set", async () => {
    const expected = fakeEmbedded(7072);
    const embed = vi.fn().mockResolvedValue(expected);
    const readInfo = vi.fn();
    const handle = await attachOrStartDaemon({
      forceEmbed: true,
      readInfo,
      isAlive: async () => true,
      embed,
    });
    expect(readInfo).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledOnce();
    expect(handle).toBe(expected);
  });

  it("propagates bindHostname to the embedded path", async () => {
    const embed = vi.fn().mockResolvedValue(fakeEmbedded(7073));
    await attachOrStartDaemon({
      readInfo: () => null,
      isAlive: async () => false,
      embed,
      bindHostname: "0.0.0.0",
    });
    expect(embed).toHaveBeenCalledWith({ bindHostname: "0.0.0.0" });
  });

  it("logs the reuse branch", async () => {
    const log = vi.fn();
    await attachOrStartDaemon({
      readInfo: () => info({ port: 6060, pid: 99 }),
      isAlive: async () => true,
      embed: vi.fn(),
      log,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("reusing canonical daemon"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pid=99"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("port=6060"));
  });

  it("logs the embed branch", async () => {
    const log = vi.fn();
    await attachOrStartDaemon({
      readInfo: () => null,
      embed: vi.fn().mockResolvedValue(fakeEmbedded(7074)),
      log,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("starting embedded daemon"));
  });
});

describe("makeExternalDaemonHandle", () => {
  it("normalises 0.0.0.0 to 127.0.0.1 for HTTP/WS URLs", () => {
    const handle = makeExternalDaemonHandle(info({ bindHostname: "0.0.0.0", port: 6066 }));
    expect(handle.apiBaseUrl).toBe("http://127.0.0.1:6066");
    expect(handle.wsUrl).toBe("ws://127.0.0.1:6066");
  });

  it("preserves non-wildcard bind hostnames", () => {
    const handle = makeExternalDaemonHandle(info({ bindHostname: "127.0.0.1", port: 5050 }));
    expect(handle.apiBaseUrl).toBe("http://127.0.0.1:5050");
  });

  it("exposes authToken as localBypassToken", () => {
    const handle = makeExternalDaemonHandle(info({ authToken: "tk" }));
    expect(handle.localBypassToken).toBe("tk");
  });

  it("stop() is a no-op (we don't own external daemons)", async () => {
    const handle = makeExternalDaemonHandle(info());
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  it("activateProject returns a stub that doesn't throw", async () => {
    const handle = makeExternalDaemonHandle(info());
    const result = await handle.activateProject("anything");
    expect(result).toBeDefined();
    await expect(result.stop()).resolves.toBeUndefined();
  });
});
