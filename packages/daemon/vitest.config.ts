import { defineConfig } from "vitest/config";

/**
 * Vitest config for the daemon package. Scoped narrowly to tests that
 * have explicitly opted into Vitest — the rest of the daemon's tests
 * still target `bun:test` and are run via the package's `test` script.
 *
 * New tests that consume Zod 4 schemas, the contracts package, or the
 * shared toolchain should land here so we stay aligned with the
 * mission-level "tsc + vitest green" gate.
 */
export default defineConfig({
  test: {
    include: [
      "src/chat/tools/**/*.test.ts",
      "src/chat/checkpoint-engine.test.ts",
      "src/chat/turn-store.test.ts",
      "src/chat/session-store.test.ts",
      "src/chat/activity-log.test.ts",
      "src/chat/checkpoint-store.test.ts",
      "src/chat/event-emissions.test.ts",
      "src/chat/chat-integration.test.ts",
      "src/chat/plan-store.test.ts",
      "src/chat/__tests__/plan-routes.test.ts",
      "src/chat/provider-registry.test.ts",
      "src/chat/provider-store.test.ts",
      "src/terminal/__tests__/*.test.ts",
    ],
  },
});
