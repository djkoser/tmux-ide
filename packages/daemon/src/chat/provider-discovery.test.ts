import { describe, expect, it } from "bun:test";
import { discoverProviders, type ProviderDiscoveryOptions } from "./provider-discovery.ts";

function lookup(
  map: Record<string, string | null>,
): NonNullable<ProviderDiscoveryOptions["pathLookup"]> {
  return async (binary) => map[binary] ?? null;
}

function execVersion(
  versions: Record<string, string>,
): NonNullable<ProviderDiscoveryOptions["exec"]> {
  return async (cmd) => ({
    stdout: versions[cmd] ? `${versions[cmd]}\n` : "",
    stderr: "",
    code: versions[cmd] ? 0 : 1,
  });
}

describe("discoverProviders", () => {
  it("marks claude-code available when claude-code-acp is on PATH", async () => {
    const { providers } = {
      providers: await discoverProviders({
        pathLookup: lookup({ "claude-code-acp": "/bin/claude-code-acp" }),
        exec: execVersion({ "/bin/claude-code-acp": "claude-code-acp 1.2.3" }),
      }),
    };

    expect(providers[0]).toMatchObject({
      kind: "claude-code",
      available: true,
      binary: "/bin/claude-code-acp",
      version: "claude-code-acp 1.2.3",
    });
  });

  it("falls back to npx for claude-code when claude-code-acp is missing", async () => {
    const providers = await discoverProviders({
      pathLookup: lookup({ "claude-code-acp": null, npx: "/bin/npx" }),
      exec: execVersion({}),
    });

    expect(providers[0]).toMatchObject({
      kind: "claude-code",
      available: true,
      binary: "/bin/npx",
    });
    expect(providers[0]?.description).toContain("via npx");
  });

  it("marks claude-code unavailable when neither claude-code-acp nor npx are on PATH", async () => {
    const providers = await discoverProviders({
      pathLookup: lookup({ "claude-code-acp": null, npx: null }),
      exec: execVersion({}),
    });

    expect(providers[0]).toMatchObject({
      kind: "claude-code",
      available: false,
      error: "neither claude-code-acp nor npx on PATH",
    });
  });

  it("populates codex version when codex --version succeeds", async () => {
    const providers = await discoverProviders({
      pathLookup: lookup({ codex: "/bin/codex" }),
      exec: execVersion({ "/bin/codex": "codex 0.1.0" }),
    });

    expect(providers[1]).toMatchObject({
      kind: "codex",
      available: true,
      binary: "/bin/codex",
      version: "codex 0.1.0",
    });
  });

  it("keeps codex available without a version when codex --version times out", async () => {
    const providers = await discoverProviders({
      pathLookup: lookup({ codex: "/bin/codex" }),
      exec: async () => {
        throw new Error("timeout");
      },
    });

    expect(providers[1]).toMatchObject({
      kind: "codex",
      available: true,
      binary: "/bin/codex",
    });
    expect(providers[1]?.version).toBeUndefined();
  });

  it("marks codex unavailable when codex is not on PATH", async () => {
    const providers = await discoverProviders({
      pathLookup: lookup({ codex: null }),
      exec: execVersion({}),
    });

    expect(providers[1]).toMatchObject({
      kind: "codex",
      available: false,
      error: "codex not on PATH",
    });
  });
});
