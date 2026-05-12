import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { childrenContainBlockElement } from "@/app/v2/_lib/V2PlansView.helpers";

/**
 * Regression test for a v2 Plans hydration warning. react-markdown wraps
 * every paragraph in <p>; when the paragraph holds a fenced code block
 * (rendered by our `code` override as <CodeBlock>, which emits <pre>), the
 * resulting <p><pre>...</pre></p> is invalid HTML and surfaces in the
 * console as a hydration error. V2PlansView's `p` override uses
 * `childrenContainBlockElement` to detect this case and drop the wrapper.
 */

function CodeBlockStub(): null {
  return null;
}
// Match production: V2PlansView identifies CodeBlock by name containing
// "codeblock" (case-insensitive).
(CodeBlockStub as unknown as { displayName: string }).displayName = "CodeBlock";

describe("childrenContainBlockElement", () => {
  it("flags <pre> children so the <p> wrapper is dropped", () => {
    expect(childrenContainBlockElement(createElement("pre", null, "x"))).toBe(true);
  });

  it("flags <div> children so the <p> wrapper is dropped", () => {
    expect(childrenContainBlockElement(createElement("div", null, "x"))).toBe(true);
  });

  it("flags a CodeBlock-like component child", () => {
    expect(childrenContainBlockElement(createElement(CodeBlockStub, null, "x"))).toBe(true);
  });

  it("does NOT flag inline children (<span>, <code>, plain text)", () => {
    expect(childrenContainBlockElement(createElement("span", null, "ok"))).toBe(false);
    expect(childrenContainBlockElement(createElement("code", null, "inline"))).toBe(false);
    expect(childrenContainBlockElement("just text")).toBe(false);
  });

  it("scans across an array of mixed children", () => {
    const inline = createElement("code", null, "x");
    const block = createElement("pre", null, "y");
    expect(childrenContainBlockElement([inline, block])).toBe(true);
    expect(childrenContainBlockElement([inline, inline])).toBe(false);
  });
});
