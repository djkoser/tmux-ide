import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkspaceRegistry } from "./workspaces.ts";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tmux-ide-ws-test-"));
  path = join(dir, "workspaces.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("loadWorkspaceRegistry", () => {
  it("returns empty for a missing file", () => {
    expect(loadWorkspaceRegistry(path)).toEqual({ version: 1, workspaces: [] });
  });

  it("returns empty for corrupt JSON", () => {
    writeFileSync(path, "{ not json");
    expect(loadWorkspaceRegistry(path).workspaces).toEqual([]);
  });

  it("parses a valid registry", () => {
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            name: "alpha",
            path: "/w/alpha",
            session: "w-alpha",
            ports: { commandCenter: 6061 },
            created: "2026-07-10T21:00:00Z",
          },
        ],
      }),
    );
    const reg = loadWorkspaceRegistry(path);
    expect(reg.version).toBe(1);
    expect(reg.workspaces).toHaveLength(1);
    expect(reg.workspaces[0]!.name).toBe("alpha");
    expect(reg.workspaces[0]!.ports.commandCenter).toBe(6061);
  });

  it("drops malformed entries but keeps valid ones", () => {
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        workspaces: [
          { name: "good", path: "/w/g", session: "w-g", ports: { commandCenter: 6062 } },
          { name: "bad-no-port", path: "/w/b", session: "w-b", ports: {} },
          { name: "bad-no-session", path: "/w/c", ports: { commandCenter: 6063 } },
        ],
      }),
    );
    const reg = loadWorkspaceRegistry(path);
    expect(reg.workspaces.map((w) => w.name)).toEqual(["good"]);
  });

  it("accepts an optional orchestrator port", () => {
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            name: "a",
            path: "/w/a",
            session: "w-a",
            ports: { commandCenter: 6061, orchestrator: 6061 },
          },
        ],
      }),
    );
    expect(loadWorkspaceRegistry(path).workspaces[0]!.ports.orchestrator).toBe(6061);
  });
});
