import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BottomPanel,
  type OutputChannel,
  type ProblemEntry,
} from "../BottomPanel";

// The xterm Terminal component pulls webgl + DOM apis we don't care about in
// this unit test; stub it to a marker element so we can assert mount state.
vi.mock("@/components/Terminal", () => ({
  Terminal: ({ id }: { id: string }) => (
    <div data-testid="terminal-stub" data-terminal-id={id}>
      terminal:{id}
    </div>
  ),
}));

beforeEach(() => {
  window.localStorage.clear();
});

describe("BottomPanel", () => {
  it("defaults to the terminal tab and hides Problems / Output", () => {
    render(<BottomPanel projectName="demo" />);
    const panel = screen.getByTestId("bottom-panel");
    expect(panel.getAttribute("data-active-tab")).toBe("terminal");
    expect(screen.getByTestId("terminal-stub").getAttribute("data-terminal-id")).toBe(
      "v2-bottom-demo",
    );
    // Hidden panels use display: none, not unmount — the marker is still
    // in the DOM so the terminal survives tab switches.
    expect(screen.getByTestId("bottom-panel-problems").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("bottom-panel-output").getAttribute("aria-hidden")).toBe("true");
  });

  it("switches tabs and keeps the Terminal mounted (host pattern)", () => {
    render(<BottomPanel projectName="demo" />);
    const terminalBefore = screen.getByTestId("terminal-stub");

    fireEvent.click(screen.getByTestId("bottom-panel-tab-problems"));
    expect(screen.getByTestId("bottom-panel").getAttribute("data-active-tab")).toBe("problems");
    expect(screen.getByTestId("bottom-panel-terminal").getAttribute("aria-hidden")).toBe("true");

    // Identity check — same DOM node, not a re-mount. xterm's WebSocket +
    // scrollback live across the tab swap.
    fireEvent.click(screen.getByTestId("bottom-panel-tab-terminal"));
    const terminalAfter = screen.getByTestId("terminal-stub");
    expect(terminalAfter).toBe(terminalBefore);
  });

  it("renders the problems list and shows the badge count", () => {
    const problems: ProblemEntry[] = [
      {
        severity: "error",
        file: "src/foo.ts",
        line: 10,
        column: 4,
        message: "Type 'string' is not assignable to 'number'.",
        source: "ts",
      },
      {
        severity: "warning",
        file: "src/bar.tsx",
        message: "Unused variable 'x'",
        source: "eslint",
      },
    ];
    render(<BottomPanel projectName="demo" problems={problems} />);
    const badge = screen.getByTestId("bottom-panel-problems-badge");
    expect(badge.textContent).toBe("2");

    fireEvent.click(screen.getByTestId("bottom-panel-tab-problems"));
    const list = screen.getByTestId("bottom-panel-problems-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("src/foo.ts");
    expect(items[0].textContent).toContain("10:4");
    expect(items[0].textContent).toContain("Type 'string' is not assignable to 'number'.");
    expect(within(list).getByTestId("problem-dot-error")).not.toBeNull();
    expect(within(list).getByTestId("problem-dot-warning")).not.toBeNull();
  });

  it("renders zero state when there are no problems", () => {
    render(<BottomPanel projectName="demo" />);
    expect(screen.queryByTestId("bottom-panel-problems-badge")).toBeNull();
    fireEvent.click(screen.getByTestId("bottom-panel-tab-problems"));
    expect(screen.getByTestId("bottom-panel-problems").textContent).toContain(
      "No problems detected.",
    );
  });

  it("switches output channels via the picker", () => {
    const channels: OutputChannel[] = [
      { id: "daemon-log", label: "Daemon" },
      { id: "hq-log", label: "HQ" },
      { id: "custom", label: "Custom" },
    ];
    render(<BottomPanel projectName="demo" outputChannels={channels} />);
    fireEvent.click(screen.getByTestId("bottom-panel-tab-output"));

    const picker = screen.getByTestId("bottom-panel-output-channel") as HTMLSelectElement;
    expect(picker.value).toBe("daemon-log");
    // First channel has no streamUrl → "not yet plumbed" placeholder.
    expect(screen.getByTestId("bottom-panel-output").textContent).toContain("not yet plumbed");

    fireEvent.change(picker, { target: { value: "hq-log" } });
    expect((picker as HTMLSelectElement).value).toBe("hq-log");
    expect(screen.getByTestId("bottom-panel-output").textContent).toContain("HQ");
  });
});
