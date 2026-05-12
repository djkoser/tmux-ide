#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const envPath = path.join(appRoot, ".env.notarize");

function parseEnvFile(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadNotarizeEnv() {
  try {
    const raw = await readFile(envPath, "utf8");
    Object.assign(process.env, parseEnvFile(raw));
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
    console.warn(
      "[notarize-local] app-electron/.env.notarize not found; packaging without local notarization secrets.",
    );
  }

  if (!process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_BASE64) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tmux-ide-notarize-"));
    const keyPath = path.join(dir, "apple-api-key.p8");
    await writeFile(keyPath, Buffer.from(process.env.APPLE_API_KEY_BASE64, "base64"));
    process.env.APPLE_API_KEY = keyPath;
  }

  const hasNotarizationSecrets =
    Boolean(process.env.APPLE_API_KEY) &&
    Boolean(process.env.APPLE_API_KEY_ID) &&
    Boolean(process.env.APPLE_API_ISSUER);
  const hasSigningSecrets = Boolean(process.env.CSC_LINK) && Boolean(process.env.CSC_KEY_PASSWORD);

  if (hasNotarizationSecrets && hasSigningSecrets) {
    console.log("[notarize-local] signing and notarization secrets detected.");
  } else if (hasSigningSecrets) {
    console.warn(
      "[notarize-local] signing secrets detected, but notarization secrets are incomplete.",
    );
  } else {
    console.warn(
      "[notarize-local] signing secrets are incomplete; electron-builder will use local keychain identity or skip signing.",
    );
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

await loadNotarizeEnv();
await run("pnpm", ["--filter", "@tmux-ide/dashboard", "build"]);
await run("pnpm", ["--filter", "@tmux-ide/app-electron", "build"]);
await run("pnpm", [
  "--filter",
  "@tmux-ide/app-electron",
  "exec",
  "electron-builder",
  "--mac",
  "--publish",
  "never",
]);
