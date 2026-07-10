import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeDispatchFile,
  LONG_MESSAGE_THRESHOLD,
  isWildcardTarget,
  resolvePanesByWildcard,
  resolveSendTargets,
  buildRecvTrigger,
  deliverReliably,
  type ReliableSendTiming,
  type DeliveryDeps,
} from "./send.ts";
import { receiveMessage, readReceipt } from "./lib/messaging.ts";
import type { PaneInfo } from "./widgets/lib/pane-comms.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmux-ide-send-test-"));
  mkdirSync(join(tmpDir, ".tasks"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeDispatchFile", () => {
  it("writes long message to dispatch file and returns trigger command", () => {
    const longMessage = "x".repeat(200);
    const result = writeDispatchFile(tmpDir, "%1", longMessage);

    expect(result).not.toBeNull();
    expect(result!.triggerCmd).toContain(".tasks/dispatch/");
    expect(result!.triggerCmd).toContain("send-1-");
    expect(existsSync(result!.filePath)).toBe(true);
    expect(readFileSync(result!.filePath, "utf-8")).toBe(longMessage);
  });

  it("returns null for short messages", () => {
    const result = writeDispatchFile(tmpDir, "%1", "hello");
    expect(result).toBeNull();
  });

  it("returns null for messages exactly at threshold", () => {
    const result = writeDispatchFile(tmpDir, "%1", "x".repeat(LONG_MESSAGE_THRESHOLD));
    expect(result).toBeNull();
  });

  it("creates dispatch directory if it does not exist", () => {
    const longMessage = "y".repeat(200);
    const result = writeDispatchFile(tmpDir, "%2", longMessage);
    expect(result).not.toBeNull();
    expect(existsSync(join(tmpDir, ".tasks", "dispatch"))).toBe(true);
  });

  it("creates unique filenames for different panes", () => {
    const msg = "z".repeat(200);
    const r1 = writeDispatchFile(tmpDir, "%1", msg);
    const r2 = writeDispatchFile(tmpDir, "%2", msg);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.filePath).not.toBe(r2!.filePath);
  });

  it("adds a random suffix so same-pane writes stay unique in the same millisecond", () => {
    const originalNow = Date.now;
    Date.now = () => 1234567890;
    try {
      const msg = "z".repeat(200);
      const r1 = writeDispatchFile(tmpDir, "%1", msg);
      const r2 = writeDispatchFile(tmpDir, "%1", msg);
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.filePath).not.toBe(r2!.filePath);
    } finally {
      Date.now = originalNow;
    }
  });
});

function pane(overrides: Partial<PaneInfo> & Pick<PaneInfo, "id" | "title">): PaneInfo {
  return {
    index: 0,
    currentCommand: "node",
    width: 100,
    height: 40,
    active: false,
    role: null,
    name: null,
    type: null,
    ...overrides,
  };
}

const TEAM_PANES: PaneInfo[] = [
  pane({ id: "%7", title: "team-input" }),
  pane({ id: "%1", title: "lead", role: "lead", name: "lead", type: "agent" }),
  pane({ id: "%3", title: "validator", role: "validator", name: "validator", type: "agent" }),
  pane({ id: "%2", title: "cw1", role: "teammate", name: "cw1", type: "agent" }),
  pane({ id: "%4", title: "cw2", role: "teammate", name: "cw2", type: "agent" }),
  pane({ id: "%5", title: "⠐ cw3", role: "teammate", name: "cw3", type: "agent" }),
  pane({ id: "%6", title: "cw4", role: "teammate", name: "cw4", type: "agent" }),
];

describe("isWildcardTarget", () => {
  it("detects * and ? globs", () => {
    expect(isWildcardTarget("cw*")).toBe(true);
    expect(isWildcardTarget("*")).toBe(true);
    expect(isWildcardTarget("cw?")).toBe(true);
  });

  it("treats plain names as exact targets", () => {
    expect(isWildcardTarget("cw1")).toBe(false);
    expect(isWildcardTarget("lead")).toBe(false);
    expect(isWildcardTarget("%1")).toBe(false);
  });
});

describe("resolvePanesByWildcard", () => {
  it("fans out cw* to every cw pane, matching @ide_name when the title is decorated", () => {
    const matched = resolvePanesByWildcard(TEAM_PANES, "cw*");
    expect(matched.map((p) => p.name)).toEqual(["cw1", "cw2", "cw3", "cw4"]);
  });

  it("broadcasts * to all agent panes, excluding the team-input pane", () => {
    const matched = resolvePanesByWildcard(TEAM_PANES, "*");
    expect(matched.map((p) => p.name)).toEqual(["lead", "validator", "cw1", "cw2", "cw3", "cw4"]);
    expect(matched.some((p) => p.title === "team-input")).toBe(false);
  });

  it("matches agent panes by role when @ide_type is unset", () => {
    const legacy = [pane({ id: "%9", title: "cw9", role: "teammate", name: "cw9" })];
    expect(resolvePanesByWildcard(legacy, "cw*").map((p) => p.name)).toEqual(["cw9"]);
  });

  it("supports ? single-character globs", () => {
    expect(resolvePanesByWildcard(TEAM_PANES, "cw?").map((p) => p.name)).toEqual([
      "cw1",
      "cw2",
      "cw3",
      "cw4",
    ]);
  });

  it("returns empty for a glob matching nothing", () => {
    expect(resolvePanesByWildcard(TEAM_PANES, "zz*")).toEqual([]);
  });

  it("does not treat glob metacharacters as regex", () => {
    expect(resolvePanesByWildcard(TEAM_PANES, "c.*")).toEqual([]);
  });
});

describe("resolveSendTargets", () => {
  it("keeps exact-name resolution single-target", () => {
    const targets = resolveSendTargets(TEAM_PANES, "cw3");
    expect(targets.map((p) => p.id)).toEqual(["%5"]);
  });

  it("still resolves the team-input pane by exact title", () => {
    expect(resolveSendTargets(TEAM_PANES, "team-input").map((p) => p.id)).toEqual(["%7"]);
  });

  it("resolves pane IDs unchanged", () => {
    expect(resolveSendTargets(TEAM_PANES, "%4").map((p) => p.name)).toEqual(["cw2"]);
  });

  it("fans out globs to multiple targets", () => {
    expect(resolveSendTargets(TEAM_PANES, "cw*")).toHaveLength(4);
  });

  it("returns empty for unknown exact names and unmatched globs", () => {
    expect(resolveSendTargets(TEAM_PANES, "nope")).toEqual([]);
    expect(resolveSendTargets(TEAM_PANES, "nope*")).toEqual([]);
  });
});

const FAST_TIMING: ReliableSendTiming = {
  timeoutMs: 100,
  retryIntervalMs: 20,
  pollIntervalMs: 10,
  maxRetries: 2,
};

function agentPane(id: string, name: string): PaneInfo {
  return {
    id,
    index: 0,
    title: name,
    currentCommand: "claude",
    width: 100,
    height: 40,
    active: false,
    role: "teammate",
    name,
    type: "agent",
  };
}

describe("buildRecvTrigger", () => {
  it("produces a short single-line trigger carrying the msg id", () => {
    const t = buildRecvTrigger("abc-123");
    expect(t).toContain("tmux-ide recv abc-123");
    expect(t.length).toBeLessThan(200);
    expect(t.includes("\n")).toBe(false);
  });
});

describe("deliverReliably", () => {
  it("delivers on the first attempt when the recipient acks (recv writes a receipt)", async () => {
    // Faithful simulation: the paste handler extracts the msg id and runs recv,
    // exactly as an agent pane would, which writes the receipt.
    const pastes: string[] = [];
    const deps: DeliveryDeps = {
      paste: (_s, _p, trigger) => {
        pastes.push(trigger);
        const id = trigger.split(" ").pop()!;
        receiveMessage(tmpDir, id);
      },
      receiptStatus: (dir, msgId) => readReceipt(dir, msgId)?.status ?? null,
      sleep: async () => {},
    };

    const res = await deliverReliably(
      tmpDir,
      "sess",
      agentPane("%2", "cw3"),
      "do the thing",
      undefined,
      FAST_TIMING,
      deps,
    );
    expect(res.outcome).toBe("delivered");
    expect(res.attempts).toBe(1);
    expect(pastes.length).toBe(1);
    expect(readReceipt(tmpDir, res.msgId)!.status).toBe("delivered");
  });

  it("retries with bounded attempts then surfaces failure for a non-receiving pane", async () => {
    const pastes: string[] = [];
    const deps: DeliveryDeps = {
      paste: (_s, _p, trigger) => pastes.push(trigger), // never acks
      receiptStatus: () => null,
      sleep: async () => {},
    };

    const res = await deliverReliably(
      tmpDir,
      "sess",
      agentPane("%2", "cw3"),
      "unreachable",
      undefined,
      FAST_TIMING,
      deps,
    );
    expect(res.outcome).toBe("failed");
    // initial paste + maxRetries re-pastes
    expect(pastes.length).toBe(FAST_TIMING.maxRetries + 1);
    expect(res.attempts).toBe(FAST_TIMING.maxRetries + 1);
  });

  it("re-pastes and succeeds when the ack lands after the first window", async () => {
    let polls = 0;
    const pastes: string[] = [];
    const deps: DeliveryDeps = {
      paste: (_s, _p, trigger) => pastes.push(trigger),
      receiptStatus: () => (++polls >= 4 ? "delivered" : null),
      sleep: async () => {},
    };

    const res = await deliverReliably(
      tmpDir,
      "sess",
      agentPane("%2", "cw3"),
      "eventually",
      undefined,
      FAST_TIMING,
      deps,
    );
    expect(res.outcome).toBe("delivered");
    expect(pastes.length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces a superseded outcome (stale directive) without failing", async () => {
    const deps: DeliveryDeps = {
      paste: () => {},
      receiptStatus: () => "superseded",
      sleep: async () => {},
    };
    const res = await deliverReliably(
      tmpDir,
      "sess",
      agentPane("%2", "cw3"),
      "stale",
      undefined,
      FAST_TIMING,
      deps,
    );
    expect(res.outcome).toBe("superseded");
  });

  it("reports per-recipient outcomes across a wildcard fan-out (some ack, some fail)", async () => {
    // cw3 acks; cw4 never does. Mirrors send()'s per-recipient fan-out reporting.
    const deps: DeliveryDeps = {
      paste: (_s, paneId, trigger) => {
        if (paneId === "%2") receiveMessage(tmpDir, trigger.split(" ").pop()!);
      },
      receiptStatus: (dir, msgId) => readReceipt(dir, msgId)?.status ?? null,
      sleep: async () => {},
    };
    const batchId = "batch01";
    const results = await Promise.all(
      [agentPane("%2", "cw3"), agentPane("%3", "cw4")].map((p) =>
        deliverReliably(tmpDir, "sess", p, "fan-out", batchId, FAST_TIMING, deps),
      ),
    );
    const byName = Object.fromEntries(results.map((r) => [r.pane.name, r.outcome]));
    expect(byName.cw3).toBe("delivered");
    expect(byName.cw4).toBe("failed");
  });
});
