#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");

function fail(message) {
  throw new Error(`[check-release-config] ${message}`);
}

function readYaml(filePath) {
  try {
    return yaml.load(readFileSync(filePath, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail(`${path.relative(repoRoot, filePath)} is not valid YAML: ${reason}`);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function hasMacTarget(config, targetName) {
  return config.mac?.target?.some((target) => target?.target === targetName);
}

function parseEntitlements(filePath) {
  const raw = readFileSync(filePath, "utf8");
  assert(
    raw.includes("<plist") && raw.includes("<dict>") && raw.includes("</plist>"),
    "entitlements plist is not a plist document",
  );
  const keys = [...raw.matchAll(/<key>([^<]+)<\/key>\s*<true\/>/g)].map((match) => match[1]);
  assert(keys.length > 0, "entitlements plist did not contain key/true entries");
  return new Set(keys);
}

const builderPath = path.join(appRoot, "electron-builder.yml");
const workflowPath = path.join(repoRoot, ".github", "workflows", "release.yml");
const entitlementsPath = path.join(appRoot, "build", "entitlements.mac.plist");

const builder = readYaml(builderPath);
const workflow = readYaml(workflowPath);

assert(builder?.mac?.notarize === true, "electron-builder mac.notarize must be true");
assert(builder?.mac?.hardenedRuntime === true, "electron-builder mac.hardenedRuntime must be true");
assert(
  builder?.mac?.entitlements === "build/entitlements.mac.plist",
  "electron-builder mac.entitlements must point at build/entitlements.mac.plist",
);
assert(
  builder?.mac?.entitlementsInherit === "build/entitlements.mac.plist",
  "electron-builder mac.entitlementsInherit must point at build/entitlements.mac.plist",
);
assert(hasMacTarget(builder, "dmg"), "electron-builder mac.target must include dmg");
assert(hasMacTarget(builder, "zip"), "electron-builder mac.target must include zip");
assert(builder?.publish?.provider === "github", "electron-builder publish.provider must be github");
assert(builder?.publish?.owner === "wavyrai", "electron-builder publish.owner must be wavyrai");
assert(builder?.publish?.repo === "tmux-ide", "electron-builder publish.repo must be tmux-ide");
assert(
  builder?.publish?.releaseType === "prerelease",
  "electron-builder publish.releaseType must be prerelease before v1.0",
);

assert(existsSync(entitlementsPath), "entitlements plist is missing");
const entitlementKeys = parseEntitlements(entitlementsPath);
for (const key of [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
  "com.apple.security.cs.allow-dyld-environment-variables",
  "com.apple.security.network.client",
  "com.apple.security.network.server",
  "com.apple.security.files.user-selected.read-write",
]) {
  assert(entitlementKeys.has(key), `entitlements plist is missing ${key}`);
}

assert(workflow?.name === "Release", "release workflow name must be Release");
assert(workflow?.jobs?.build, "release workflow must define jobs.build");

console.log("[check-release-config] release config is valid.");
