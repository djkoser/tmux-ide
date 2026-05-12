import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatTabPanel } from "../ChatTabPanel";

vi.mock("@tmux-ide/chat-solid", () => ({
  mount: vi.fn(() => ({ unmount: vi.fn(), setThreadId: vi.fn() })),
}));

describe("ChatTabPanel", () => {
  it("renders the Solid island mount container", () => {
    render(<ChatTabPanel sessionName="alpha" threadId="thread-1" />);

    const panel = screen.getByTestId("chat-tab-panel");
    expect(panel.getAttribute("data-session-name")).toBe("alpha");
    expect(panel.getAttribute("data-thread-id")).toBe("thread-1");
  });
});
