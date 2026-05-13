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

describe("MessageBubble — assistant", () => {
  it("renders markdown as HTML inside the .chat-markdown wrapper", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "**bold**",
      toolCalls: [],
    });

    const md = container.querySelector(".chat-markdown");
    expect(md).toBeTruthy();
    expect(md?.querySelector("strong")?.textContent).toBe("bold");
    expect(container.textContent).not.toContain("**bold**");
  });

  it("attaches data-role='assistant' + data-streaming attributes", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: true,
      text: "hi",
      toolCalls: [],
    });

    const row = container.querySelector('[data-testid="message-row"]');
    expect(row?.getAttribute("data-role")).toBe("assistant");
    expect(row?.getAttribute("data-streaming")).toBe("true");
  });

  it("renders a streaming caret when streaming is true", () => {
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

  it("renders animated working dots when streaming with no content yet", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: true,
      text: "",
      toolCalls: [],
    });

    expect(container.querySelector('[data-testid="message-working"]')).toBeTruthy();
  });

  it("renders the 'No assistant output' placeholder when there's nothing to show", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "",
      toolCalls: [],
    });

    expect(container.querySelector('[data-testid="message-empty"]')?.textContent).toBe(
      "No assistant output.",
    );
  });

  it("renders a stop-reason chip when the message has stopReason", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "done",
      toolCalls: [],
      stopReason: "end_turn",
    });

    const chip = container.querySelector('[data-testid="message-stop-reason"]');
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain("end turn"); // underscore → space
  });

  it("renders a collapsible Thought details element when thoughtText is set", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "out",
      thoughtText: "internal monologue",
      toolCalls: [],
    });

    const details = container.querySelector('[data-testid="message-thought"]');
    expect(details).toBeTruthy();
    expect(details?.tagName).toBe("DETAILS");
    expect(details?.textContent).toContain("internal monologue");
  });

  it("shows the provider name in the header strip (not as a 'You' label)", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "hi",
      toolCalls: [],
    });

    const header = container.querySelector("header");
    expect(header?.textContent).toContain("Claude");
    expect(container.textContent).not.toContain("You");
  });
});

describe("MessageBubble — user", () => {
  it("attaches data-role='user' + right-aligns the bubble", () => {
    const container = mountMessage({
      id: "user-1",
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      content: [{ type: "text", text: "Hello!" }],
    });

    const row = container.querySelector('[data-testid="message-row"]');
    expect(row?.getAttribute("data-role")).toBe("user");
    expect(row?.className).toContain("justify-end");
  });

  it("renders the t3 bubble shape (rounded-2xl + rounded-br-sm + bg-surface)", () => {
    const container = mountMessage({
      id: "user-1",
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      content: [{ type: "text", text: "Hello!" }],
    });

    const article = container.querySelector("article");
    expect(article).toBeTruthy();
    expect(article!.className).toContain("rounded-2xl");
    expect(article!.className).toContain("rounded-br-sm");
    expect(article!.className).toContain("max-w-[80%]");
    // Uses --surface token, not a hardcoded color
    expect(article!.className).toContain("bg-[var(--surface)]");
  });

  it("renders markdown content from text blocks", () => {
    const container = mountMessage({
      id: "user-1",
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      content: [{ type: "text", text: "**ship it**" }],
    });

    expect(container.querySelector("strong")?.textContent).toBe("ship it");
    expect(container.querySelector(".chat-markdown")).toBeTruthy();
  });

  it("renders a right-aligned timestamp footer when createdAt is set", () => {
    const container = mountMessage({
      id: "user-1",
      role: "user",
      createdAt: "2026-01-01T12:34:00.000Z",
      content: [{ type: "text", text: "hi" }],
    });

    const ts = container.querySelector('[data-testid="message-timestamp"]');
    expect(ts).toBeTruthy();
    expect(ts?.className).toContain("text-right");
    // toLocaleTimeString format varies by env — just assert it has digits
    expect(ts?.textContent ?? "").toMatch(/\d/);
  });

  it("never renders the 'You' label (t3 uses bubble alignment as the cue)", () => {
    const container = mountMessage({
      id: "user-1",
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      content: [{ type: "text", text: "ping" }],
    });

    expect(container.textContent).not.toContain("You");
  });
});

describe("MessageBubble — token discipline", () => {
  it("uses design tokens (--surface/--border/--fg/--dim) — never raw hex", () => {
    const container = mountMessage({
      id: "assistant-1",
      role: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      text: "hi",
      toolCalls: [],
      stopReason: "end_turn",
    });

    // Every component-applied className that resolves to a color must
    // route through a CSS var. A naive grep against the rendered DOM —
    // any `#RRGGBB` or `rgb(` in a `class=` attribute is a regression.
    const html = container.innerHTML;
    const offendingClassColors = html.match(/class="[^"]*#[0-9a-fA-F]{3,8}[^"]*"/g);
    expect(offendingClassColors).toBeNull();
  });
});
