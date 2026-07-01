import { describe, expect, it } from "vitest";
import { nextInput } from "./input.ts";

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
