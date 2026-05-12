import { defineConfig } from "tsdown";

/**
 * Bundles the Electron main + preload entries into `dist-electron/`.
 *
 * - `main`   — runs in Node (Electron main process). Imports the embedded
 *   daemon from the project's compiled `dist/lib/daemon-embed.js` (Slice
 *   E1's exported function). All native deps stay external so they
 *   resolve from the parent workspace's node_modules.
 * - `preload` — runs in the renderer's isolated context. Exposes
 *   `window.__TMUX_IDE__ = { port, version }` via contextBridge.
 *
 * `format: "cjs"` because Electron's `main` field expects CommonJS unless
 * you opt into ESM via the `type: "module"` route, which has rough edges
 * for native modules (node-pty in particular). CJS is the conservative
 * pick that matches t3code.
 */
export default defineConfig([
  {
    // Bundle main + loader together so a single `clean: true` pass writes
    // both. The loader is the package's `main` entry (tiny script that
    // logs and forwards to main.cjs); main.cjs is the heavy bundle.
    entry: {
      main: "src/main.ts",
      loader: "src/loader.ts",
    },
    outDir: "dist-electron",
    format: "cjs",
    platform: "node",
    target: "node20",
    external: [
      "electron",
      "electron-updater",
      // Native modules — must stay external; they ship under asarUnpack.
      "node-pty",
      "better-sqlite3",
      "@parcel/watcher",
    ],
    // Bundle @tmux-ide/* workspace packages into main.cjs. tsdown auto-
    // externalises bare-name imports by default; `noExternal` whitelists
    // patterns to inline. We bundle daemon + contracts so the packaged
    // .app does not depend on pnpm symlinks (electron-builder cannot pack
    // workspace symlinks whose targets resolve outside this package's
    // tree) at runtime. Native modules are still external and ship via
    // asarUnpack.
    noExternal: [/^@tmux-ide\//],
    clean: true,
  },
  {
    entry: { preload: "src/preload.ts" },
    outDir: "dist-electron",
    format: "cjs",
    platform: "node",
    target: "node20",
    external: ["electron"],
  },
]);
