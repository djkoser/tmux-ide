/**
 * Belt-and-braces prepublish guard.
 *
 * `prepublishOnly` already runs `pnpm check`. This script adds the
 * static-file freshness assert that lifecycle step doesn't —
 * specifically, that the git-tracked build output `bin/cli.js` is
 * actually newer than the source it's built from. The maintainer can
 * forget to rebuild + stage it before tagging; this script fails
 * loudly when that happens.
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

run("pnpm", ["run", "lint:workspace"]);
run("pnpm", ["run", "typecheck"]);
run("pnpm", ["run", "test:unit"]);

// ---------------------------------------------------------------
// bin/cli.js freshness — the esbuild output ships in the tarball.
// `prepublishOnly` now runs `pnpm build:cli` first, but this assert
// stays as defense-in-depth: a stale `bin/cli.js` is the #1 way the
// maintainer accidentally publishes pre-edit CLI behaviour.
// ---------------------------------------------------------------
const cliJsPath = join(process.cwd(), "bin", "cli.js");
const cliTsPath = join(process.cwd(), "bin", "cli.ts");
if (!existsSync(cliJsPath)) {
  throw new Error("bin/cli.js is missing — run: pnpm build:cli && git add bin/cli.js");
}
if (!existsSync(cliTsPath)) {
  throw new Error("bin/cli.ts is missing — repository appears corrupted");
}
const cliJsMtime = statSync(cliJsPath).mtimeMs;
const cliTsMtime = statSync(cliTsPath).mtimeMs;
if (cliJsMtime < cliTsMtime) {
  throw new Error(
    "bin/cli.js is older than bin/cli.ts — run: pnpm build:cli && git add bin/cli.js",
  );
}
