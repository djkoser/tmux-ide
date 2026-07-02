/**
 * Unit tests for the pure kitty-protocol fallback helpers.
 */
import { describe, expect, it } from "vitest";
import { kittyEscapeFor, kittyUserKeyIndex, kittyUserKeyName } from "./kitty-keys.ts";

describe("kittyEscapeFor", () => {
  it("encodes each default dock Alt key as its full-kitty ESC[<code>;3:1u form", () => {
    // code = the character's code point; 3 = Alt modifier; :1 = key-press event.
    const cases: Array<[string, number]> = [
      ["M-m", 109],
      ["M-p", 112],
      ["M-k", 107],
      ["M-b", 98],
      ["M-e", 101],
      ["M-g", 103],
      ["M-h", 104],
      ["M-,", 44],
    ];
    for (const [key, code] of cases) {
      expect(kittyEscapeFor(key)).toBe(`\x1b[${code};3:1u`);
    }
  });

  it("lowercases the char so the code point is the base-layout key", () => {
    // (defaults are lowercase; this pins the documented behaviour)
    expect(kittyEscapeFor("M-H")).toBe(`\x1b[104;3:1u`);
  });

  it("returns null for non-single-char and non-Alt keys", () => {
    for (const key of ["M-Enter", "C-a", "p", "", "M-", "MouseDown3Pane", "User100"]) {
      expect(kittyEscapeFor(key)).toBeNull();
    }
  });
});

describe("kittyUserKeyIndex / kittyUserKeyName", () => {
  it("claims the user-keys range at offset 100 so it can't clobber user entries", () => {
    expect(kittyUserKeyIndex(0)).toBe(100);
    expect(kittyUserKeyIndex(7)).toBe(107);
    expect(kittyUserKeyName(0)).toBe("User100");
    expect(kittyUserKeyName(7)).toBe("User107");
  });
});
