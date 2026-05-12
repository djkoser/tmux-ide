import { createRequire } from "node:module";
import siloPlugin from "./eslint-rules/silo-plugin.mjs";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const nextConfig = require("eslint-config-next/core-web-vitals");

/** React 19 / Compiler rules in eslint-plugin-react-hooks v7 flag many valid patterns (hydration guards, ref indirection, polling). Re-enable incrementally. */
const config = [
  ...nextConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
  // T059 zone boundary + G14-T01 silo boundary (RSC-shell + siloed-blocks rule).
  // Dashboard is UI-only, talks to daemon over HTTP/WS. Silo packages may only
  // be reached via their PUBLIC entry point (`@tmux-ide/<silo>`), never their
  // internals (`@tmux-ide/<silo>/src/**`). See ADR-0001 §1.4 Rule 1.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@tmux-ide/daemon",
                "@tmux-ide/daemon/*",
                "@tmux-ide/tmux-bridge",
                "@tmux-ide/tmux-bridge/*",
              ],
              message:
                "dashboard is UI-only — talk to daemon over HTTP/WS at runtime; types belong in @tmux-ide/contracts (T059)",
            },
            {
              group: ["**/packages/daemon/**", "**/packages/tmux-bridge/**"],
              message:
                "dashboard is UI-only — no relative reaches into daemon/tmux-bridge (T059)",
            },
            // G14-T01 Rule 1: deep silo imports forbidden — only the public
            // package entry point is allowed across the silo boundary.
            {
              group: [
                "@tmux-ide/chat-solid/*",
                "@tmux-ide/v2-solid-widgets/*",
              ],
              message:
                "Silo internals are off-limits — import the silo's public entry (@tmux-ide/<silo>) only. See ADR-0001 §1.4 Rule 1.",
            },
            {
              group: [
                "**/packages/chat-solid/src/**",
                "**/packages/v2-solid-widgets/src/**",
              ],
              message:
                "Silo internals are off-limits — no relative reaches into a silo's src/. See ADR-0001 §1.4 Rule 1.",
            },
          ],
        },
      ],
    },
  },

  // G14-T01 Rules 2 + 3: custom plugin.
  // Register the plugin globally so rule names resolve everywhere.
  {
    plugins: { silo: siloPlugin },
  },
  // Rule 3 (one-silo-per-file) applies everywhere in the dashboard — there is
  // never a good reason for a single .ts/.tsx to import both silos.
  {
    rules: {
      "silo/no-cross-silo-import": "error",
    },
  },
  // Rule 2 (RSC purity) applies only to actual RSC entry points:
  // page/layout/template/error/loading/not-found/default under app/. These
  // are the files that Next.js evaluates as server components by default —
  // shared hook modules (e.g. `use-hotkeys.ts`) are correctly "use client" via
  // transitivity from their importer and should not be flagged.
  {
    files: [
      "app/**/page.tsx",
      "app/**/page.ts",
      "app/**/layout.tsx",
      "app/**/layout.ts",
      "app/**/template.tsx",
      "app/**/error.tsx",
      "app/**/loading.tsx",
      "app/**/not-found.tsx",
      "app/**/default.tsx",
    ],
    rules: {
      "silo/rsc-no-client-hooks": "error",
    },
  },

  // G14-T01 Rule 5: server actions and route handlers must not import silo
  // runtimes — silos are browser-only; importing server-side either crashes
  // (no `window`) or bundles framework runtime into Node. ADR-0001 §1.4 Rule 5.
  {
    files: [
      "app/**/route.ts",
      "app/**/route.tsx",
      "app/**/actions.ts",
      "app/**/actions.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@tmux-ide/chat-solid",
                "@tmux-ide/chat-solid/*",
                "@tmux-ide/v2-solid-widgets",
                "@tmux-ide/v2-solid-widgets/*",
              ],
              message:
                "Server actions / route handlers must not import silo runtimes — silos are browser-only. See ADR-0001 §1.4 Rule 5.",
            },
          ],
        },
      ],
    },
  },

  // Test files exercise both silos and use hooks freely.
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "silo/rsc-no-client-hooks": "off",
      "silo/no-cross-silo-import": "off",
    },
  },
];

export default config;
