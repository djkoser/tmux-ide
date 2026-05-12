import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import siloPlugin from "../silo-plugin.mjs";

// RuleTester uses describe/it internally. Wire it to vitest's globals.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("silo/rsc-no-client-hooks (Rule 2)", siloPlugin.rules["rsc-no-client-hooks"], {
  valid: [
    {
      code: `"use client";\nimport { useState } from "react";\nexport function X(){const [a]=useState(0);return a}`,
    },
    {
      code: `import { type ReactNode } from "react";\nexport default function Page(){return null}`,
    },
    {
      code: `"use client";\nimport { create } from "zustand";\nexport default create(() => ({}));`,
    },
    { code: `import { Suspense } from "react";\nexport default function Page(){return null}` },
  ],
  invalid: [
    {
      code: `import { useState } from "react";\nexport default function Page(){return null}`,
      errors: [{ messageId: "hook", data: { name: "useState" } }],
    },
    {
      code: `import { useEffect, useRef } from "react";\nexport default function Page(){return null}`,
      errors: [{ messageId: "hook" }, { messageId: "hook" }],
    },
    {
      code: `import { create } from "zustand";\nexport default function Page(){return null}`,
      errors: [{ messageId: "lib", data: { name: "zustand" } }],
    },
    {
      code: `import { atom } from "jotai";\nexport default function Page(){return null}`,
      errors: [{ messageId: "lib", data: { name: "jotai" } }],
    },
  ],
});

ruleTester.run("silo/no-cross-silo-import (Rule 3)", siloPlugin.rules["no-cross-silo-import"], {
  valid: [
    { code: `import x from "@tmux-ide/chat-solid";\nexport default x;` },
    {
      code: `import x from "@tmux-ide/chat-solid";\nimport y from "@tmux-ide/chat-solid";\nexport default [x,y];`,
    },
    { code: `import x from "react";\nimport y from "@tmux-ide/contracts";\nexport default {x,y};` },
    { code: `import w from "@tmux-ide/v2-solid-widgets";\nexport default w;` },
  ],
  invalid: [
    {
      code: `import a from "@tmux-ide/chat-solid";\nimport b from "@tmux-ide/v2-solid-widgets";\nexport default [a,b];`,
      errors: [{ messageId: "crossSilo" }],
    },
    {
      code: `import a from "@tmux-ide/v2-solid-widgets";\nimport b from "@tmux-ide/chat-solid";\nexport default [a,b];`,
      errors: [{ messageId: "crossSilo" }],
    },
  ],
});
