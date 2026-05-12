import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushToast = vi.fn();

const PROJECTS = [
  {
    name: "alpha",
    dir: "/repos/alpha",
    hasIdeYml: true,
    gitOrigin: null,
    gitBranch: null,
    registeredAt: "2026-05-01T00:00:00Z",
  },
  {
    name: "beta",
    dir: "/repos/beta",
    hasIdeYml: true,
    gitOrigin: null,
    gitBranch: null,
    registeredAt: "2026-05-01T00:00:00Z",
  },
];

vi.mock("@/lib/projectStore", () => ({
  useProjects: () => ({ projects: PROJECTS, loading: false, error: false }),
}));

vi.mock("@/lib/useToasts", () => ({
  useToasts: () => ({ push: pushToast }),
}));

vi.mock("@/lib/api", () => ({
  chatProvidersList: vi.fn(async () => ({
    providers: [
      {
        kind: "claude-code",
        name: "Claude Code",
        description: "Anthropic's coding agent",
        available: true,
        version: "v2.1.131",
      },
      {
        kind: "codex",
        name: "Codex",
        description: "OpenAI's coding agent",
        available: true,
        version: "v0.9.0",
      },
      {
        kind: "gemini",
        name: "Gemini Code",
        description: "Google's coding agent",
        available: false,
        error: "Install gemini-acp first",
      },
    ],
  })),
  chatThreadCreate: vi.fn(async () => ({
    thread: {
      id: "thread-1",
      title: "New chat",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      providerKind: "codex",
      projectDir: "/repos/alpha",
      messageCount: 0,
    },
  })),
}));

async function renderPicker(
  props: Partial<ComponentProps<typeof import("../NewChatPicker").NewChatPicker>> = {},
) {
  const { NewChatPicker } = await import("../NewChatPicker");
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <NewChatPicker
      open
      defaultSessionName="alpha"
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />,
  );
  return { onClose, onCreated };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const api = await import("@/lib/api");
  vi.mocked(api.chatProvidersList).mockClear();
  vi.mocked(api.chatThreadCreate).mockClear();
});

describe("NewChatPicker", () => {
  it("renders provider tiles from the API", async () => {
    await renderPicker();

    expect(screen.getByTestId("new-chat-provider-skeletons")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeTruthy());
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByText("Gemini Code")).toBeTruthy();
  });

  it("selects available tiles and keeps unavailable tiles disabled with error text", async () => {
    await renderPicker();
    await waitFor(() => expect(screen.getByTestId("new-chat-provider-codex")).toBeTruthy());

    const claude = screen.getByTestId("new-chat-provider-claude-code");
    const codex = screen.getByTestId("new-chat-provider-codex");
    const gemini = screen.getByTestId("new-chat-provider-gemini");

    expect(claude.getAttribute("data-selected")).toBe("true");
    fireEvent.click(codex);
    expect(codex.getAttribute("data-selected")).toBe("true");
    expect(gemini).toHaveProperty("disabled", true);
    expect(gemini.getAttribute("title")).toBe("Install gemini-acp first");
    fireEvent.click(gemini);
    expect(codex.getAttribute("data-selected")).toBe("true");
  });

  it("creates a thread with the selected provider and project dir", async () => {
    const { onClose, onCreated } = await renderPicker();
    const api = await import("@/lib/api");
    await waitFor(() => expect(screen.getByTestId("new-chat-provider-codex")).toBeTruthy());

    fireEvent.click(screen.getByTestId("new-chat-provider-codex"));
    fireEvent.click(screen.getByText("Create thread"));

    await waitFor(() => {
      expect(api.chatThreadCreate).toHaveBeenCalledWith({
        provider: { kind: "codex" },
        projectDir: "/repos/alpha",
      });
      expect(onCreated).toHaveBeenCalledWith({
        id: "thread-1",
        title: "New chat",
        sessionName: "alpha",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("keeps the dialog open and pushes a toast when create fails", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.chatThreadCreate).mockRejectedValueOnce(new Error("create failed"));
    const { onClose, onCreated } = await renderPicker();
    await waitFor(() => expect(screen.getByText("Create thread")).toBeTruthy());

    fireEvent.click(screen.getByText("Create thread"));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "error",
          title: "Could not create chat",
          body: "create failed",
        }),
      );
    });
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Esc without creating", async () => {
    const api = await import("@/lib/api");
    const { onClose } = await renderPicker();
    await waitFor(() => expect(screen.getByTestId("new-chat-picker")).toBeTruthy());

    fireEvent.keyDown(screen.getByTestId("new-chat-picker"), { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    expect(api.chatThreadCreate).not.toHaveBeenCalled();
  });
});
