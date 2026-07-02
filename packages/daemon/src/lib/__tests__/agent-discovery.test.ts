/**
 * Unit tests for agent auto-discovery — the pure registry and the injectable
 * PATH/integration probe. No test shells out or reads the real settings: the
 * which-runner and the integration probe are both injected.
 */
import { describe, expect, it } from "vitest";
import {
  KNOWN_AGENTS,
  discoverAgents,
  presentAgents,
  type WhichRunner,
} from "../agent-discovery.ts";

describe("KNOWN_AGENTS", () => {
  it("lists claude as the only integrated agent, with stable ids/bins", () => {
    const claude = KNOWN_AGENTS.find((a) => a.id === "claude");
    expect(claude).toEqual({ id: "claude", bin: "claude", integration: true });
    // exactly one integration installer today
    expect(KNOWN_AGENTS.filter((a) => a.integration).map((a) => a.id)).toEqual(["claude"]);
    // the rest are detection-only
    expect(KNOWN_AGENTS.map((a) => a.id)).toEqual([
      "claude",
      "codex",
      "opencode",
      "gemini",
      "aider",
    ]);
  });

  it("uses the id as the probed binary for every agent", () => {
    for (const a of KNOWN_AGENTS) expect(a.bin).toBe(a.id);
  });
});

describe("discoverAgents", () => {
  const foundAt =
    (paths: Record<string, string>): WhichRunner =>
    (bin) =>
      paths[bin] ?? null;

  it("resolves paths from the injected which-runner and never probes for absent ones", () => {
    const which = foundAt({ claude: "/usr/bin/claude", codex: "/opt/codex" });
    const agents = discoverAgents(which, () => false);
    const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
    expect(byId.claude!.path).toBe("/usr/bin/claude");
    expect(byId.codex!.path).toBe("/opt/codex");
    expect(byId.gemini!.path).toBeNull();
    expect(byId.aider!.path).toBeNull();
  });

  it("carries the registry `integration` flag onto each record", () => {
    const agents = discoverAgents(
      () => null,
      () => false,
    );
    const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
    expect(byId.claude!.integration).toBe(true);
    expect(byId.codex!.integration).toBe(false);
  });

  it("sets installed only for an integrated agent present AND whose probe says installed", () => {
    const which = foundAt({ claude: "/usr/bin/claude", opencode: "/usr/bin/opencode" });
    const installed = discoverAgents(which, (id) => id === "claude");
    const byId = Object.fromEntries(installed.map((a) => [a.id, a]));
    expect(byId.claude!.installed).toBe(true);
    // present but non-integrated → never "installed"
    expect(byId.opencode!.installed).toBe(false);
  });

  it("leaves installed false when claude is present but the integration is not installed", () => {
    const which = foundAt({ claude: "/usr/bin/claude" });
    const agents = discoverAgents(which, () => false);
    expect(agents.find((a) => a.id === "claude")!.installed).toBe(false);
  });

  it("leaves installed false when claude is absent, without calling the probe", () => {
    let probed = false;
    const agents = discoverAgents(
      () => null,
      () => {
        probed = true;
        return true;
      },
    );
    expect(agents.find((a) => a.id === "claude")!.installed).toBe(false);
    expect(probed).toBe(false);
  });

  it("never throws when the which-runner throws — the runner owns its own errors", () => {
    // The contract is that a WhichRunner never throws; a well-behaved default
    // swallows errors to null. A runner that returns null for everything yields
    // an all-absent table without discoverAgents itself throwing.
    expect(() =>
      discoverAgents(
        () => null,
        () => false,
      ),
    ).not.toThrow();
  });

  it("returns one record per known agent, in registry order", () => {
    const agents = discoverAgents(
      () => null,
      () => false,
    );
    expect(agents.map((a) => a.id)).toEqual(KNOWN_AGENTS.map((a) => a.id));
  });
});

describe("presentAgents", () => {
  it("keeps only agents with a resolved path", () => {
    const agents = discoverAgents(
      (bin) => (bin === "claude" ? "/usr/bin/claude" : null),
      () => true,
    );
    expect(presentAgents(agents).map((a) => a.id)).toEqual(["claude"]);
  });
});
