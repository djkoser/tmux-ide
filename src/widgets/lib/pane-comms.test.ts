import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import {
  _setExecutor,
  listSessionPanes,
  findPaneByTitle,
  findPaneByPattern,
  findAdjacentPane,
  isPaneBusy,
  getPaneBusyStatus,
  resolveTarget,
  isAgentPane,
  isAgentBusy,
  agentIdentifier,
} from "./pane-comms.ts";
import { makePane } from "../../__tests__/support.ts";

let restoreExec: () => void;
let mockOutput: string;
let tmuxCalls: string[][];

beforeEach(() => {
  mockOutput = "";
  tmuxCalls = [];
  restoreExec = _setExecutor((_cmd: string, args: string[]) => {
    tmuxCalls.push(args);
    return mockOutput;
  });
});

afterEach(() => {
  restoreExec();
});

function setMockPanes(output: string) {
  mockOutput = output;
}

const TWO_PANES = ["%0\t0\tFiles\tzsh\t80\t24\t0", "%1\t1\tClaude\tclaude\t80\t24\t1"].join("\n");

const THREE_PANES = [
  "%0\t0\tFiles\tzsh\t80\t24\t0",
  "%1\t1\tClaude\tclaude\t80\t24\t1",
  "%2\t2\tShell\tzsh\t80\t24\t0",
].join("\n");

describe("listSessionPanes", () => {
  it("parses tmux list-panes output correctly", () => {
    setMockPanes(TWO_PANES);
    const panes = listSessionPanes("test-session");
    expect(panes.length).toBe(2);
    expect(panes[0]!.id).toBe("%0");
    expect(panes[0]!.title).toBe("Files");
    expect(panes[0]!.currentCommand).toBe("zsh");
    expect(panes[0]!.active).toBe(false);
    expect(panes[1]!.id).toBe("%1");
    expect(panes[1]!.title).toBe("Claude");
    expect(panes[1]!.active).toBe(true);
  });

  it("returns empty array when no output", () => {
    setMockPanes("");
    const panes = listSessionPanes("test-session");
    expect(panes).toEqual([]);
  });
});

describe("findPaneByTitle", () => {
  it("finds pane by exact title match", () => {
    setMockPanes(TWO_PANES);
    expect(findPaneByTitle("s", "Claude")).toBe("%1");
  });

  it("returns null when title not found", () => {
    setMockPanes(TWO_PANES);
    expect(findPaneByTitle("s", "Shell")).toBe(null);
  });
});

describe("findPaneByPattern", () => {
  it("finds pane by case-insensitive substring", () => {
    setMockPanes(TWO_PANES);
    expect(findPaneByPattern("s", "claude")).toBe("%1");
  });

  it("returns null when pattern not found", () => {
    setMockPanes(TWO_PANES);
    expect(findPaneByPattern("s", "editor")).toBe(null);
  });
});

describe("findAdjacentPane", () => {
  it("returns the next pane", () => {
    setMockPanes(TWO_PANES);
    expect(findAdjacentPane("s", "%0")).toBe("%1");
  });

  it("wraps around to the first pane", () => {
    setMockPanes(TWO_PANES);
    expect(findAdjacentPane("s", "%1")).toBe("%0");
  });

  it("returns null when only one pane", () => {
    setMockPanes("%0\t0\tFiles\tzsh\t80\t24\t1");
    expect(findAdjacentPane("s", "%0")).toBe(null);
  });

  it("returns null when pane not found", () => {
    setMockPanes(TWO_PANES);
    expect(findAdjacentPane("s", "%99")).toBe(null);
  });
});

describe("isPaneBusy", () => {
  it("returns false for shell panes", () => {
    setMockPanes("%0\t0\tShell\tzsh\t80\t24\t0");
    expect(isPaneBusy("s", "%0")).toBe(false);
  });

  it("returns true for vim", () => {
    setMockPanes("%0\t0\tEditor\tvim\t80\t24\t0");
    expect(isPaneBusy("s", "%0")).toBe(true);
  });

  it("returns true for unknown pane", () => {
    setMockPanes(TWO_PANES);
    expect(isPaneBusy("s", "%99")).toBe(true);
  });
});

describe("getPaneBusyStatus", () => {
  it("returns agent for claude panes", () => {
    setMockPanes("%0\t0\tClaude\tclaude\t80\t24\t1");
    expect(getPaneBusyStatus("s", "%0")).toBe("agent");
  });

  it("returns idle for shell panes", () => {
    setMockPanes("%0\t0\tShell\tbash\t80\t24\t0");
    expect(getPaneBusyStatus("s", "%0")).toBe("idle");
  });

  it("returns busy for vim", () => {
    setMockPanes("%0\t0\tEditor\tvim\t80\t24\t0");
    expect(getPaneBusyStatus("s", "%0")).toBe("busy");
  });

  it("returns busy for unknown pane", () => {
    setMockPanes(TWO_PANES);
    expect(getPaneBusyStatus("s", "%99")).toBe("busy");
  });

  it("returns agent for an @ide_type=agent pane even when the command is a version string", () => {
    // Claude Code renames its process to its version, so pane_current_command is
    // e.g. "2.1.207" — not "claude". The @ide_type metadata is authoritative.
    setMockPanes("%0\t0\tcw1\t2.1.207\t80\t24\t1\tteammate\tcw1\tagent");
    expect(getPaneBusyStatus("s", "%0")).toBe("agent");
  });

  it("returns agent by @ide_role when type is absent", () => {
    setMockPanes("%0\t0\tlead\t2.1.207\t80\t24\t1\tlead\tlead\t");
    expect(getPaneBusyStatus("s", "%0")).toBe("agent");
  });
});

describe("resolveTarget", () => {
  it("returns explicit paneId first", () => {
    setMockPanes(THREE_PANES);
    expect(resolveTarget("s", { paneId: "%2" })).toBe("%2");
  });

  it("finds by title", () => {
    setMockPanes(THREE_PANES);
    expect(resolveTarget("s", { title: "Shell" })).toBe("%2");
  });

  it("finds by title pattern", () => {
    setMockPanes(THREE_PANES);
    expect(resolveTarget("s", { titlePattern: "claude" })).toBe("%1");
  });

  it("falls back to adjacent pane", () => {
    setMockPanes(THREE_PANES);
    expect(resolveTarget("s", { selfPaneId: "%0" })).toBe("%1");
  });

  it("prefers title over adjacency", () => {
    setMockPanes(THREE_PANES);
    expect(resolveTarget("s", { title: "Shell", selfPaneId: "%0" })).toBe("%2");
  });

  it("returns null when nothing matches", () => {
    setMockPanes(THREE_PANES);
    expect(resolveTarget("s", {})).toBe(null);
  });
});

describe("isAgentPane (canonical classifier)", () => {
  // tmux-ide metadata is authoritative and independent of the process command.
  it("detects an @ide_type=agent pane even when the command is a version string", () => {
    expect(isAgentPane(makePane({ type: "agent", currentCommand: "2.1.207" }))).toBe(true);
  });

  it("detects an @ide_type=agent pane whose command is a plain shell", () => {
    expect(isAgentPane(makePane({ type: "agent", currentCommand: "zsh", title: "Shell" }))).toBe(
      true,
    );
  });

  it("detects each agent @ide_role when type is absent", () => {
    for (const role of [
      "lead",
      "teammate",
      "planner",
      "validator",
      "reviewer",
      "researcher",
    ] as const) {
      expect(isAgentPane(makePane({ role, currentCommand: "zsh" }))).toBe(true);
    }
  });

  // Command/title heuristics catch panes tmux-ide didn't stamp.
  it("detects claude and codex commands", () => {
    expect(isAgentPane(makePane({ currentCommand: "claude" }))).toBe(true);
    expect(isAgentPane(makePane({ currentCommand: "codex" }))).toBe(true);
  });

  it("detects a version-string command regardless of title", () => {
    expect(isAgentPane(makePane({ currentCommand: "2.1.80", title: "Dev Server" }))).toBe(true);
  });

  it("detects the Claude Code title banner", () => {
    expect(isAgentPane(makePane({ currentCommand: "node", title: "Claude Code" }))).toBe(true);
  });

  it("detects a French agent display name, including under a leading spinner", () => {
    expect(isAgentPane(makePane({ currentCommand: "node", title: "François" }))).toBe(true);
    expect(isAgentPane(makePane({ currentCommand: "node", title: "⠙ François" }))).toBe(true);
  });

  it("does not match a plain shell pane with no agent metadata", () => {
    expect(isAgentPane(makePane({ currentCommand: "zsh", title: "Shell" }))).toBe(false);
  });

  it("does not match a widget or untyped input pane", () => {
    expect(isAgentPane(makePane({ role: "widget", currentCommand: "node", title: "Console" }))).toBe(
      false,
    );
  });
});

describe("isAgentBusy", () => {
  it("returns true when a spinner glyph leads the title", () => {
    expect(isAgentBusy(makePane({ title: "⠙ Working..." }))).toBe(true);
  });

  it("returns false for a normal title", () => {
    expect(isAgentBusy(makePane({ title: "Claude Code" }))).toBe(false);
  });
});

describe("agentIdentifier", () => {
  it("prefers the configured pane name", () => {
    expect(agentIdentifier(makePane({ name: "cw2", index: 3 }))).toBe("cw2");
  });

  it("falls back to a stable French name by pane index", () => {
    expect(agentIdentifier(makePane({ name: null, index: 0 }))).toBe("François");
    expect(agentIdentifier(makePane({ name: null, index: 1 }))).toBe("Amélie");
  });
});
