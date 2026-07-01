import { describe, expect, it } from "vitest";
import { nextInput, suggestSessionName } from "./input.ts";

describe("nextInput", () => {
  it("appends a printable char", () => {
    expect(nextInput("ab", { name: "c" })).toBe("abc");
  });

  it("slices on backspace", () => {
    expect(nextInput("abc", { name: "backspace" })).toBe("ab");
    expect(nextInput("", { name: "backspace" })).toBe("");
  });

  it("ignores modified keys", () => {
    expect(nextInput("ab", { name: "c", ctrl: true })).toBeNull();
    expect(nextInput("ab", { name: "c", alt: true })).toBeNull();
    expect(nextInput("ab", { name: "c", meta: true })).toBeNull();
  });

  it("ignores non-printable named keys", () => {
    expect(nextInput("ab", { name: "return" })).toBeNull();
    expect(nextInput("ab", { name: "escape" })).toBeNull();
    expect(nextInput("ab", { name: "up" })).toBeNull();
  });
});

describe("suggestSessionName", () => {
  it("returns the base when it's free", () => {
    expect(suggestSessionName("web", () => false)).toBe("web");
  });

  it("appends -2 on a single collision", () => {
    expect(suggestSessionName("web", (n) => n === "web")).toBe("web-2");
  });

  it("skips past a run of taken suffixes", () => {
    const taken = new Set(["web", "web-2", "web-3"]);
    expect(suggestSessionName("web", (n) => taken.has(n))).toBe("web-4");
  });
});
