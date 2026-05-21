import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export type DiscoverableProviderKind = "claude-code" | "codex";

export interface ProviderModelInfo {
  slug: string;
  name: string;
  description?: string;
}

export interface ProviderInfo {
  kind: DiscoverableProviderKind;
  name: string;
  description: string;
  available: boolean;
  binary?: string;
  version?: string;
  error?: string;
  /**
   * Real, daemon-owned model list. First entry is the recommended
   * default. Empty when the provider binary is missing — callers should
   * suppress the model picker in that case.
   *
   * Kept editorial in the daemon for now: claude-code has no
   * remote-listing endpoint, and codex's `model/list` JSON-RPC sits
   * behind app-server initialization. A future round can replace these
   * with a live probe; the wire shape is stable.
   */
  models: ProviderModelInfo[];
}

/**
 * Hand-maintained model catalog (daemon-owned, NOT the client's
 * hardcoded list — see audit §3). The order matters: index 0 is the
 * surfaced default. Bump these as providers ship new models.
 */
const CLAUDE_CODE_MODELS: ProviderModelInfo[] = [
  {
    slug: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    description: "1M context · highest capability",
  },
  {
    slug: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Balanced speed + quality",
  },
  {
    slug: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "Fastest · low cost",
  },
];

// Codex-with-ChatGPT-account auth only accepts codex-suffixed models;
// the bare `gpt-5` selection returns
// `{"type":"invalid_request_error","message":"The 'gpt-5' model is not
// supported when using Codex with a ChatGPT account."}`. Match t3's
// codex-specific model list.
const CODEX_MODELS: ProviderModelInfo[] = [
  { slug: "gpt-5-codex", name: "GPT-5 Codex", description: "Code-tuned" },
  { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex", description: "Newer code-tuned" },
];

export interface ProviderDiscoveryExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface ProviderDiscoveryOptions {
  pathLookup?: (binary: string) => Promise<string | null>;
  exec?: (
    cmd: string,
    args: string[],
    opts?: { timeoutMs?: number },
  ) => Promise<ProviderDiscoveryExecResult>;
}

const VERSION_TIMEOUT_MS = 1_500;

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveFromPath(binary: string): Promise<string | null> {
  if (isAbsolute(binary)) return (await isExecutable(binary)) ? binary : null;
  if (binary.includes("/")) return (await isExecutable(binary)) ? binary : null;

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

async function defaultExec(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<ProviderDiscoveryExecResult> {
  return await new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts.timeoutMs }, (err, stdout, stderr) => {
      const exitCode =
        err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number"
          ? (err as NodeJS.ErrnoException & { code: number }).code
          : err
            ? null
            : 0;
      resolve({ stdout, stderr, code: exitCode });
    });
  });
}

function firstStdoutLine(result: ProviderDiscoveryExecResult): string | undefined {
  return result.code === 0
    ? result.stdout
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim()
    : undefined;
}

async function bestEffortVersion(
  exec: NonNullable<ProviderDiscoveryOptions["exec"]>,
  binary: string,
): Promise<string | undefined> {
  try {
    return firstStdoutLine(await exec(binary, ["--version"], { timeoutMs: VERSION_TIMEOUT_MS }));
  } catch {
    return undefined;
  }
}

async function discoverClaudeCode(
  pathLookup: NonNullable<ProviderDiscoveryOptions["pathLookup"]>,
  exec: NonNullable<ProviderDiscoveryOptions["exec"]>,
): Promise<ProviderInfo> {
  const direct = await pathLookup("claude-code-acp");
  if (direct) {
    const version = await bestEffortVersion(exec, direct);
    return {
      kind: "claude-code",
      name: "Claude Code",
      description: "Claude Code via claude-code-acp",
      available: true,
      binary: direct,
      ...(version ? { version } : {}),
      models: CLAUDE_CODE_MODELS,
    };
  }

  const npx = await pathLookup("npx");
  if (npx) {
    return {
      kind: "claude-code",
      name: "Claude Code",
      description: "Claude Code via npx",
      available: true,
      binary: npx,
      models: CLAUDE_CODE_MODELS,
    };
  }

  return {
    kind: "claude-code",
    name: "Claude Code",
    description: "Claude Code via claude-code-acp",
    available: false,
    error: "neither claude-code-acp nor npx on PATH",
    models: [],
  };
}

async function discoverCodex(
  pathLookup: NonNullable<ProviderDiscoveryOptions["pathLookup"]>,
  exec: NonNullable<ProviderDiscoveryOptions["exec"]>,
): Promise<ProviderInfo> {
  const binary = await pathLookup("codex");
  if (!binary) {
    return {
      kind: "codex",
      name: "Codex",
      description: "Codex app-server proxy",
      available: false,
      error: "codex not on PATH",
      models: [],
    };
  }

  const version = await bestEffortVersion(exec, binary);
  return {
    kind: "codex",
    name: "Codex",
    description: "Codex app-server proxy",
    available: true,
    binary,
    ...(version ? { version } : {}),
    models: CODEX_MODELS,
  };
}

export async function discoverProviders(
  opts: ProviderDiscoveryOptions = {},
): Promise<ProviderInfo[]> {
  const pathLookup = opts.pathLookup ?? resolveFromPath;
  const exec = opts.exec ?? defaultExec;
  return [await discoverClaudeCode(pathLookup, exec), await discoverCodex(pathLookup, exec)];
}
