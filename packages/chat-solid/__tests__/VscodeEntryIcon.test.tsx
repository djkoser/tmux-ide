/**
 * VscodeEntryIcon — renders the supplied icon URL with a glyph
 * fallback when (a) no URL is supplied, or (b) the image fires onError.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { basename, VscodeEntryIcon } from "../src/components/VscodeEntryIcon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("src/components/Foo.tsx")).toBe("Foo.tsx");
  });

  it("ignores trailing slashes for directories", () => {
    expect(basename("src/components/")).toBe("components");
  });

  it("returns the whole string when no slash is present", () => {
    expect(basename("README.md")).toBe("README.md");
  });
});

describe("VscodeEntryIcon", () => {
  function mount(opts: Parameters<typeof VscodeEntryIcon>[0]) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = render(() => <VscodeEntryIcon {...opts} />, container);
    return { container, dispose };
  }

  it("renders an <img> with the supplied iconUrl when provided", () => {
    const { container, dispose } = mount({
      pathValue: "src/Foo.tsx",
      kind: "file",
      iconUrl: "/icons/tsx.svg",
    });
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/icons/tsx.svg");
    dispose();
  });

  it("falls back to the file glyph when no iconUrl is supplied", () => {
    const { container, dispose } = mount({ pathValue: "src/Foo.tsx", kind: "file" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("📄");
    dispose();
  });

  it("falls back to the folder glyph for directories without iconUrl", () => {
    const { container, dispose } = mount({ pathValue: "src/", kind: "directory" });
    expect(container.textContent).toContain("📁");
    dispose();
  });

  it("falls back to the glyph when the image fires onError", () => {
    const { container, dispose } = mount({
      pathValue: "src/Foo.tsx",
      kind: "file",
      iconUrl: "/icons/missing.svg",
    });
    const img = container.querySelector<HTMLImageElement>("img");
    img!.dispatchEvent(new Event("error", { bubbles: true }));
    // After the error event lands, the component swaps to the fallback glyph.
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("📄");
    expect(
      container.querySelector("[data-testid='vscode-entry-icon']")?.getAttribute("data-failed"),
    ).toBe("true");
    dispose();
  });

  it("exposes pathValue + kind via data-* hooks", () => {
    const { container, dispose } = mount({
      pathValue: "src/Foo.tsx",
      kind: "file",
      iconUrl: "/icons/tsx.svg",
    });
    const root = container.querySelector("[data-testid='vscode-entry-icon']");
    expect(root?.getAttribute("data-kind")).toBe("file");
    expect(root?.getAttribute("data-path")).toBe("src/Foo.tsx");
    dispose();
  });
});
