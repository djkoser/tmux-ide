#!/usr/bin/env node
/**
 * Dev runner: waits for tsdown to emit `dist-electron/main.cjs`, then
 * launches Electron pointing at it. Reruns Electron when main.cjs is
 * rewritten by `tsdown --watch`.
 *
 * For the dashboard we expect either:
 *   (a) the user is also running `pnpm --filter @tmux-ide/dashboard dev`
 *       on http://localhost:3000 and sets TMUX_IDE_DASHBOARD_DEV_URL,
 *   (b) the user has run `pnpm --filter @tmux-ide/dashboard build` so the
 *       static export is available under dashboard/out/.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// Use the loader entry (see start-electron.mjs for rationale). We
// still watch main.cjs for changes because that's the file tsdown
// rewrites on every rebuild.
const entryPath = path.join(root, "dist-electron", "loader.cjs");
const mainPath = path.join(root, "dist-electron", "main.cjs");

// Resolve the bundled Electron runtime (an absolute path to the binary)
// via the `electron` package — `spawn("electron", …)` would otherwise
// fail with ENOENT in launch contexts that don't carry node_modules/.bin
// on PATH (e.g. direct `node scripts/dev-electron.mjs` invocations).
const require = createRequire(pathToFileURL(path.join(root, "package.json")).href);
const electronBinary = require("electron");

async function waitForMain() {
  while (!fs.existsSync(mainPath)) {
    await new Promise((r) => setTimeout(r, 250));
  }
}

let child = null;
function launch() {
  if (child) child.kill();
  // Sensible dev default: point at the running Next.js dev server on
  // :3000. Override with TMUX_IDE_DASHBOARD_DEV_URL=… (empty = use the
  // app:// static-export protocol, which requires `dashboard build` to
  // have produced dashboard/out/index.html).
  const devUrl = process.env.TMUX_IDE_DASHBOARD_DEV_URL ?? "http://localhost:3000";
  child = spawn(electronBinary, [entryPath], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      TMUX_IDE_DASHBOARD_DEV_URL: devUrl,
      // See start-electron.mjs for the rationale: workspace packages
      // (e.g. @tmux-ide/contracts) ship as .ts source and use enums,
      // which require --experimental-transform-types rather than the
      // default --experimental-strip-types.
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS ?? "",
        "--experimental-transform-types",
        "--no-warnings",
      ]
        .filter(Boolean)
        .join(" "),
    },
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[dev-electron] exited with code ${code}`);
    }
  });
}

await waitForMain();
launch();

fs.watch(mainPath, () => {
  console.log("[dev-electron] main.cjs changed, restarting Electron...");
  launch();
});
