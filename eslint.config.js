import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      ".worktrees/**",
      "docs/**",
      "node_modules/**",
      "coverage/**",
      "context/**",
      "dist/**",
      ".next/**",
      "plans/**",
      "templates/**",
      ".github/**",
    ],
  },
  js.configs.recommended,
  {
    files: [
      "bin/**/*.{js,mjs}",
      "scripts/**/*.{js,mjs}",
      "src/**/*.{js,mjs}",
      "*.{js,mjs}",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: [
      "bin/**/*.ts",
      "scripts/**/*.ts",
      "src/**/*.ts",
      "app-electron/src/**/*.ts",
      "packages/contracts/src/**/*.ts",
      "packages/daemon/src/**/*.ts",
      "packages/tmux-bridge/src/**/*.ts",
      "packages/v2-solid-widgets/src/**/*.{ts,tsx}",
      "packages/chat-solid/src/**/*.{ts,tsx}",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["app-electron/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Solid.js packages use the `let el; … <Foo ref={el} />` pattern that
  // ESLint flags as never-assigned because the assignment happens via
  // the JSX ref attribute at runtime.
  {
    files: [
      "packages/v2-solid-widgets/src/**/*.{ts,tsx}",
      "packages/chat-solid/src/**/*.{ts,tsx}",
    ],
    rules: {
      "no-unassigned-vars": "off",
    },
  },

  // ===========================================================================
  // T059 — Zone boundaries (ARCHITECTURE.md "Import direction").
  //
  //   contracts ← tmux-bridge ← daemon ← dashboard
  //       ↑                       ↑          ↑
  //       └── v2-solid-widgets ───┘          │
  //       └── chat-solid ───────────────────-┘
  //
  // Arrows point in the allowed direction; A ← B means "B may import A".
  // Each block applies `no-restricted-imports` to one zone using ESLint's
  // built-in rule. The disallow list covers both the workspace alias
  // ("@tmux-ide/daemon") AND the raw relative-path glob
  // ("**/packages/daemon/**") so back-edges fail regardless of how the
  // import is written.
  // ===========================================================================
  {
    files: ["packages/contracts/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tmux-ide/*", "!@tmux-ide/contracts"],
              message: "contracts is the leaf zone — no workspace imports allowed (T059)",
            },
            {
              group: [
                "**/packages/*/src/**",
                "!**/packages/contracts/src/**",
              ],
              message: "contracts is the leaf zone — no relative reaches into other packages (T059)",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/tmux-bridge/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tmux-ide/*", "!@tmux-ide/contracts"],
              message: "tmux-bridge may only import @tmux-ide/contracts (T059)",
            },
            {
              group: [
                "**/packages/*/src/**",
                "!**/packages/contracts/src/**",
                "!**/packages/tmux-bridge/src/**",
              ],
              message: "tmux-bridge may only relative-import within itself or contracts (T059)",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/daemon/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@tmux-ide/v2-solid-widgets",
                "@tmux-ide/v2-solid-widgets/*",
                "@tmux-ide/chat-solid",
                "@tmux-ide/chat-solid/*",
                "@tmux-ide/dashboard",
                "@tmux-ide/dashboard/*",
              ],
              message: "daemon must not import UI-side packages — those are downstream consumers (T059)",
            },
            {
              group: [
                "**/dashboard/**",
                "**/app-electron/**",
                "**/packages/v2-solid-widgets/**",
                "**/packages/chat-solid/**",
              ],
              message: "daemon must not relative-reach into UI packages (T059)",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/v2-solid-widgets/src/**/*.{ts,tsx}",
      "packages/chat-solid/src/**/*.{ts,tsx}",
    ],
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
              message: "UI-side packages are HTTP/WS clients — talk to daemon at runtime, not via imports (T059)",
            },
            {
              group: [
                "**/packages/daemon/**",
                "**/packages/tmux-bridge/**",
              ],
              message: "UI-side packages must not relative-reach into daemon/tmux-bridge (T059)",
            },
          ],
        },
      ],
    },
  },

  // dashboard zone rule lives in dashboard/eslint.config.mjs (it has its
  // own eslint-config-next setup; mixing it into the root config triggers
  // an eslint-plugin-react / eslint version conflict).
];
