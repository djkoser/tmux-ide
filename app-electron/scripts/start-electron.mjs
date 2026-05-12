#!/usr/bin/env node
/**
 * Production runner: launches Electron against the bundled main.cjs. Used
 * by `pnpm start` for smoke-testing a non-packaged build.
 *
 * Resolves the Electron binary via the `electron` package's default
 * export (the absolute path of the installed runtime) rather than
 * relying on `electron` being on PATH — Node spawns inherit the
 * parent's PATH, which omits node_modules/.bin in most launch
 * contexts (e.g. running this script directly, not through pnpm).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// Use the loader entry point (the package's `main` field). The loader
// installs persistent diagnostic logging before `require`ing main.cjs,
// and main.cjs's own chunk-require paths only resolve correctly when
// loaded through the loader's directory (see loader.ts for the
// rationale).
const entryPath = path.join(root, "dist-electron", "loader.cjs");

const require = createRequire(pathToFileURL(path.join(root, "package.json")).href);
const electronBinary = require("electron");

// Some workspace packages ship as .ts source (notably `@tmux-ide/contracts`,
// whose `main` points at src/index.ts). Node's default `--experimental-strip-types`
// rejects TS enums; `--experimental-transform-types` accepts them. Set it
// here so the daemon's dist/ can `require('@tmux-ide/contracts')` at
// runtime without pre-building the contracts package.
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--experimental-transform-types", "--no-warnings"]
    .filter(Boolean)
    .join(" "),
};

const child = spawn(electronBinary, [entryPath], {
  cwd: root,
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
