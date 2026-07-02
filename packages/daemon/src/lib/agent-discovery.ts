/**
 * Agent auto-discovery — which coding agents live on THIS machine, and do we
 * have a lifecycle integration for each.
 *
 * The onboarding gap this closes: tmux-ide can hook Claude Code's lifecycle for
 * ground-truth pane state (`tmux-ide integration install claude`), but nothing
 * told the user that agent was even detected. Discovery makes the tool notice —
 * doctor lists what it found, the first adopt offers the integration.
 *
 * {@link KNOWN_AGENTS} is the pure registry: each entry names an agent, the
 * binary we probe for, and whether tmux-ide ships an installer for it
 * (`integration: true` → we can hook its lifecycle; `false` → we only have
 * screen-manifest detection). {@link discoverAgents} probes the current PATH via
 * an injectable which-runner and, for agents we integrate, reports whether that
 * integration is installed. Both the probe and the integration check are
 * injectable so tests never shell out or read the real settings.
 */
import { execFileSync } from "node:child_process";
import { claudeIntegrationStatus } from "../tui/integrations/claude.ts";

/** A coding agent tmux-ide knows how to detect. */
export interface KnownAgent {
  /** Stable id — also the `tmux-ide integration <install|status> <id>` selector. */
  id: string;
  /** The binary we probe for on PATH. */
  bin: string;
  /** True → tmux-ide ships a lifecycle-integration installer for this agent. */
  integration: boolean;
}

/**
 * The agents tmux-ide recognizes. `integration: true` means we HAVE an installer
 * (a real lifecycle hook → ground-truth pane state); the rest are detected via
 * screen-manifest scraping only, with no lifecycle hook yet.
 */
export const KNOWN_AGENTS: readonly KnownAgent[] = [
  { id: "claude", bin: "claude", integration: true },
  { id: "codex", bin: "codex", integration: false },
  { id: "opencode", bin: "opencode", integration: false },
  { id: "gemini", bin: "gemini", integration: false },
  { id: "aider", bin: "aider", integration: false },
];

/** One probed agent: its registry facts plus what the PATH/integration probe found. */
export interface DiscoveredAgent {
  id: string;
  bin: string;
  /** Whether tmux-ide ships an installer for this agent (copied from the registry). */
  integration: boolean;
  /** Absolute path to the binary (first `which` hit), or null when absent from PATH. */
  path: string | null;
  /**
   * The INTEGRATION-installed state: true only for an agent we integrate whose
   * integration is actually installed. Always false for agents we don't
   * integrate (there's nothing to install) and for any agent absent from PATH.
   */
  installed: boolean;
}

/** Resolve a binary to its absolute path, or null. Must never throw. */
export type WhichRunner = (bin: string) => string | null;

/** Report whether a given agent's integration is installed. Must never throw. */
export type IntegrationProbe = (agentId: string) => boolean;

/**
 * Default which-runner: `which <bin>`, hard-capped at 2s, swallowing every
 * failure (not-found, missing `which`, timeout) into `null`. Returns the FIRST
 * line only — a shell function/alias shadowing plus a real binary can make
 * `which` emit several.
 */
const defaultWhich: WhichRunner = (bin) => {
  try {
    const out = execFileSync("which", [bin], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    if (out.length === 0) return null;
    return out.split("\n")[0]!.trim() || null;
  } catch {
    return null;
  }
};

/**
 * Default integration probe: only `claude` has an installer, so only it can be
 * "installed". Reads the real Claude settings; any failure degrades to false so
 * discovery never throws.
 */
const defaultIntegrationProbe: IntegrationProbe = (agentId) => {
  if (agentId !== "claude") return false;
  try {
    return claudeIntegrationStatus().installed;
  } catch {
    return false;
  }
};

/**
 * Probe the current PATH for every {@link KNOWN_AGENTS} entry. For agents we
 * integrate, `installed` carries the real integration status; for the rest it's
 * always false (nothing to install). Both the PATH probe and the integration
 * check are injectable for tests; this never throws.
 */
export function discoverAgents(
  which: WhichRunner = defaultWhich,
  isInstalled: IntegrationProbe = defaultIntegrationProbe,
): DiscoveredAgent[] {
  return KNOWN_AGENTS.map((agent) => {
    const path = which(agent.bin);
    const present = path !== null;
    const installed = present && agent.integration ? isInstalled(agent.id) : false;
    return { id: agent.id, bin: agent.bin, integration: agent.integration, path, installed };
  });
}

/** The subset of discovered agents actually present on PATH (path resolved). */
export function presentAgents(agents: DiscoveredAgent[]): DiscoveredAgent[] {
  return agents.filter((a) => a.path !== null);
}
