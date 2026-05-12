import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { MessageBubble } from "../src/components/MessageBubble";
import type { ChatMessage } from "../src/types";

afterEach(() => {
  document.body.innerHTML = "";
});

function mountMessage(message: ChatMessage): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(() => <MessageBubble message={message} providerName={() => "Claude"} />, container);
  return container;
}

describe("MessageBubble", () => {
  it("renders assistant markdown as HTML", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "**bold**",
      toolCalls: [],
    });

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.textContent).not.toContain("**bold**");
  });

  it("renders streaming caret next to markdown output", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: true,
      text: "**bold**",
      toolCalls: [],
    });

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector(".chat-solid-caret")).toBeTruthy();
  });
});
