import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // smoke.spec.ts owns its own runtime model (no webServer, prod
  // build, daemon + dashboard wired up manually by smoke.yml). The
  // default config below boots dev servers — feeding the smoke spec
  // those would defeat the purpose and trip its console-error
  // budget. Pane 1's playwright.smoke.config.ts runs that file
  // exclusively; this config sticks to the surviving v1-shell specs.
  testIgnore: ["smoke.spec.ts"],
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      // Use the compiled JS entry, not bin/cli.ts via
      // --experimental-strip-types. Node's strip-only TS loader
      // can't handle TS enums (the codex protocol uses them),
      // which broke the harness boot. bin/cli.js is the canonical
      // production entry point per CLAUDE.md and imports from
      // dist/, so `pnpm build` is a prerequisite for e2e.
      command: "node bin/cli.js server --port 6070",
      url: "http://127.0.0.1:6070/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "NEXT_PUBLIC_TMUX_IDE_SERVER_PORT=6070 pnpm --filter @tmux-ide/dashboard dev",
      url: "http://127.0.0.1:3000/terminal/default",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
