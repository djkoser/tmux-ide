import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
      command:
        "NODE_OPTIONS=--no-warnings node --experimental-strip-types bin/cli.ts server --port 6070",
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
