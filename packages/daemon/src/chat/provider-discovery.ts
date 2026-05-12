import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export type DiscoverableProviderKind = "claude-code" | "codex";

export interface ProviderInfo {
  kind: DiscoverableProviderKind;
  name: string;
  description: string;
  available: boolean;
  binary?: string;
  version?: string;
  error?: string;
}

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
    };
  }

  return {
    kind: "claude-code",
    name: "Claude Code",
    description: "Claude Code via claude-code-acp",
    available: false,
    error: "neither claude-code-acp nor npx on PATH",
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
  };
}

export async function discoverProviders(
  opts: ProviderDiscoveryOptions = {},
): Promise<ProviderInfo[]> {
  const pathLookup = opts.pathLookup ?? resolveFromPath;
  const exec = opts.exec ?? defaultExec;
  return [await discoverClaudeCode(pathLookup, exec), await discoverCodex(pathLookup, exec)];
}
