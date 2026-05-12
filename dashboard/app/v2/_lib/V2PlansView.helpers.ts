import { Children, isValidElement, type ReactNode } from "react";

/**
 * react-markdown wraps every block (including code fences) in <p>. When the
 * inner block is something invalid for <p> descendants (<pre>, <div>, our
 * <CodeBlock>) the resulting <p><pre>...</pre></p> trips a React hydration
 * warning. This predicate finds those cases so V2PlansView's `p` override
 * can unwrap.
 */
export function childrenContainBlockElement(node: ReactNode): boolean {
  let found = false;
  Children.forEach(node, (child) => {
    if (found || !isValidElement(child)) return;
    const rawType: unknown = (child as { type?: unknown }).type;
    if (typeof rawType === "string") {
      if (rawType === "pre" || rawType === "div") found = true;
      return;
    }
    if (typeof rawType === "function") {
      const t = rawType as { displayName?: string; name?: string };
      const name = (t.displayName ?? t.name ?? "").toLowerCase();
      if (name.includes("codeblock")) found = true;
    }
  });
  return found;
}
