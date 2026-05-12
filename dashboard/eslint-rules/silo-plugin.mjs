// Local ESLint plugin enforcing the RSC-shell + siloed-blocks rule
// (docs/adr/0001-rsc-shell-and-siloed-blocks.md / goal-14 §1.4).
//
// Rules:
//   rsc-no-client-hooks       — Rule 2: RSC files (no "use client") must not
//                               import React client hooks or client-state libs.
//   no-cross-silo-import      — Rule 3: a bridge/island file may import at
//                               most one silo package. Cross-silo
//                               coordination belongs at the React layer above.

const CLIENT_HOOKS = new Set([
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useRef",
  "useReducer",
  "useCallback",
  "useMemo",
  "useImperativeHandle",
  "useContext",
  "useSyncExternalStore",
  "useTransition",
  "useDeferredValue",
  "useId",
  "useOptimistic",
  "useFormStatus",
  "useFormState",
  "useActionState",
]);

const CLIENT_STATE_PACKAGES = ["zustand", "jotai", "valtio", "mobx", "mobx-react", "mobx-react-lite"];
const SILO_PACKAGES = ["@tmux-ide/chat-solid", "@tmux-ide/v2-solid-widgets"];

function hasUseClientDirective(ast) {
  // The "use client" directive must be the first statement.
  const first = ast.body[0];
  if (!first || first.type !== "ExpressionStatement") return false;
  const expr = first.expression;
  if (!expr || expr.type !== "Literal") return false;
  return expr.value === "use client";
}

const rscNoClientHooks = {
  meta: {
    type: "problem",
    docs: { description: "RSC files must not import React client hooks or client-state libraries." },
    messages: {
      hook: 'Importing "{{name}}" requires a "use client" directive at the top of this file. RSC (server) components cannot use client hooks. See ADR-0001.',
      lib: 'Importing "{{name}}" (client-state library) requires a "use client" directive at the top of this file. See ADR-0001.',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    if (hasUseClientDirective(source.ast)) return {};
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (typeof src !== "string") return;
        if (src === "react" || src === "react-dom") {
          for (const spec of node.specifiers) {
            if (spec.type === "ImportSpecifier" && CLIENT_HOOKS.has(spec.imported.name)) {
              context.report({ node: spec, messageId: "hook", data: { name: spec.imported.name } });
            }
          }
          return;
        }
        if (CLIENT_STATE_PACKAGES.includes(src) || CLIENT_STATE_PACKAGES.some((p) => src.startsWith(`${p}/`))) {
          context.report({ node, messageId: "lib", data: { name: src } });
        }
      },
    };
  },
};

const noCrossSiloImport = {
  meta: {
    type: "problem",
    docs: { description: "A single file must not import from more than one silo package." },
    messages: {
      crossSilo:
        'Cross-silo import: this file already imports from "{{first}}"; "{{second}}" is a different silo. Each silo gets its own bridge component — cross-silo coordination happens in React above the bridges. See ADR-0001 §1.4 Rule 3.',
    },
    schema: [],
  },
  create(context) {
    let firstSilo = null;
    let firstNode = null;
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (typeof src !== "string") return;
        const matched = SILO_PACKAGES.find((p) => src === p || src.startsWith(`${p}/`));
        if (!matched) return;
        if (!firstSilo) {
          firstSilo = matched;
          firstNode = node;
          return;
        }
        if (firstSilo !== matched) {
          context.report({
            node,
            messageId: "crossSilo",
            data: { first: firstSilo, second: matched },
          });
        }
      },
    };
  },
};

const siloPlugin = {
  rules: {
    "rsc-no-client-hooks": rscNoClientHooks,
    "no-cross-silo-import": noCrossSiloImport,
  },
};

export default siloPlugin;
