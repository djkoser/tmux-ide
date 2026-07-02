/**
 * Unit tests for the doctor's pure "agent integrations" row builder. The row
 * text depends only on a DiscoveredAgent[], so no io is needed here.
 */
import { describe, expect, it } from "vitest";
import { agentIntegrationRows } from "./doctor.ts";
import type { DiscoveredAgent } from "./lib/agent-discovery.ts";

const agent = (over: Partial<DiscoveredAgent>): DiscoveredAgent => ({
  id: "x",
  bin: "x",
  integration: false,
  path: "/usr/bin/x",
  installed: false,
  ...over,
});

describe("agentIntegrationRows", () => {
  it("omits agents absent from PATH (no noise)", () => {
    const rows = agentIntegrationRows([
      agent({ id: "gemini", integration: false, path: null }),
      agent({ id: "claude", integration: true, path: null }),
    ]);
    expect(rows).toEqual([]);
  });

  it("renders an installed claude as a passing ✓ row", () => {
    const rows = agentIntegrationRows([
      agent({ id: "claude", integration: true, path: "/bin/claude", installed: true }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("agent: claude");
    expect(rows[0]!.pass).toBe(true);
    expect(rows[0]!.optional).toBe(true);
    expect(rows[0]!.detail).toContain("integration installed");
  });

  it("renders a present-but-uninstalled claude as a ○ hint pointing at the installer", () => {
    const rows = agentIntegrationRows([
      agent({ id: "claude", integration: true, path: "/bin/claude", installed: false }),
    ]);
    expect(rows[0]!.pass).toBe(false); // ○, not ✓
    expect(rows[0]!.optional).toBe(true); // never fails the overall check
    expect(rows[0]!.detail).toContain("tmux-ide integration install claude");
  });

  it("renders a non-integrated agent as a passing screen-manifest row", () => {
    const rows = agentIntegrationRows([
      agent({ id: "opencode", integration: false, path: "/bin/opencode" }),
    ]);
    expect(rows[0]!.label).toBe("agent: opencode");
    expect(rows[0]!.pass).toBe(true);
    expect(rows[0]!.detail).toContain("screen-manifest");
    expect(rows[0]!.detail).toContain("no lifecycle integration");
  });

  it("keeps every row optional so discovery never fails doctor overall", () => {
    const rows = agentIntegrationRows([
      agent({ id: "claude", integration: true, path: "/bin/claude", installed: false }),
      agent({ id: "codex", integration: false, path: "/bin/codex" }),
    ]);
    expect(rows.every((r) => r.optional)).toBe(true);
  });
});
