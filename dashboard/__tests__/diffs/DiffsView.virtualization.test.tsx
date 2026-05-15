/**
 * Contracts test for the virtualized DiffsView changed-files list.
 *
 * Mocks the git status fetch with a 1000-file working tree and
 * asserts only a viewport-sized window of rows lands in the DOM.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { DiffsView } from "@/components/DiffsView";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/git/status")) {
      return new Response(
        JSON.stringify({
          status: {
            currentBranch: "main",
            ahead: 0,
            behind: 0,
            staged: [],
            unstaged: Array.from({ length: 1000 }, (_, i) => ({
              path: `src/file-${i.toString().padStart(4, "0")}.ts`,
              status: "modified",
            })),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("DiffsView virtualization", () => {
  it("renders only a viewport-sized window of rows for 1000 changed files", async () => {
    const { container } = render(() => <DiffsView projectName="proj" />);

    await waitFor(() =>
      expect(container.querySelectorAll("[data-index]").length).toBeGreaterThan(0),
    );

    const rendered = container.querySelectorAll<HTMLElement>("[data-index]");
    expect(rendered.length).toBeLessThan(200);

    const spacer = container.querySelector<HTMLElement>(
      "[data-testid='diffs-view-spacer']",
    );
    expect(spacer).toBeTruthy();
    const h = parseInt(spacer!.style.height, 10);
    // 1000 × at least 26px = 26000px.
    expect(h).toBeGreaterThan(20_000);
  });
});
