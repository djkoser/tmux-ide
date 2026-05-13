/**
 * Wire-coverage for ChatSolidBridge (T1).
 *
 * The bridge mounts `chat-solid` once a thread is selected and forwards
 * the `onProviderChange` callback. That callback POSTs through
 * chat-solid's `chatThreadSetProvider` helper (which hits the daemon's
 * `chat.thread.setProvider` action). After a successful swap, the
 * bridge nudges chat-solid via `setOptions({ threadId })` to force a
 * refetch.
 *
 * Other bridge-level wires (mount config: apiBaseUrl, wsUrl) are also
 * asserted so a regression that drops them isn't silent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  clearCaptures,
  getCaptured,
  mockFetchOk,
  waitForCapture,
} from "@/lib/test/wireTest";

const chatSpies = vi.hoisted(() => ({
  chatThreadSetProvider: vi.fn().mockResolvedValue({ thread: { id: "t1" } }),
}));

vi.mock("@tmux-ide/chat-solid", async () => {
  const mod = await import("@/lib/test/wireTest");
  return mod.createMockChatSolid({
    chatThreadSetProvider: chatSpies.chatThreadSetProvider,
  });
});

import { ChatSolidBridge } from "@/components/chat-v2/chat-solid-bridge";

interface ChatCaptured {
  threadId?: string | null;
  sessionName?: string | null;
  apiBaseUrl?: string;
  wsUrl?: string;
  onProviderChange?: (next: string) => Promise<void> | void;
  onOpenFile?: (meta: { href: string }) => void;
  onClose?: () => void;
}

beforeEach(() => {
  clearCaptures();
  chatSpies.chatThreadSetProvider.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatSolidBridge — wire", () => {
  it("renders an empty-state placeholder until a thread is selected", () => {
    mockFetchOk();
    const { getByTestId, queryByTestId } = render(
      <ChatSolidBridge threadId={null} sessionName="proj" />,
    );
    expect(getByTestId("chat-solid-empty")).toBeTruthy();
    expect(queryByTestId("chat-solid-bridge")).toBeNull();
  });

  it("mounts chat-solid with apiBaseUrl + wsUrl + sessionName once a thread is set", async () => {
    mockFetchOk();
    render(<ChatSolidBridge threadId="t1" sessionName="proj" />);
    const opts = await waitForCapture<ChatCaptured>("ChatSolid");
    expect(opts.threadId).toBe("t1");
    expect(opts.sessionName).toBe("proj");
    expect(typeof opts.apiBaseUrl).toBe("string");
    expect(opts.apiBaseUrl).toMatch(/^https?:\/\//);
    // The daemon's unified push channel is /ws/events — chat.* frames
    // ride on it alongside task/mission/etc.
    expect(opts.wsUrl).toMatch(/^wss?:\/\/.*\/ws\/events$/);
  });

  it("onProviderChange dispatches chatThreadSetProvider + refreshes the mount", async () => {
    mockFetchOk();
    render(<ChatSolidBridge threadId="t1" sessionName="proj" />);
    const opts = await waitForCapture<ChatCaptured>("ChatSolid");
    await opts.onProviderChange!("acp");

    expect(chatSpies.chatThreadSetProvider).toHaveBeenCalledTimes(1);
    const args = chatSpies.chatThreadSetProvider.mock.calls[0]!;
    // [runtime, id, provider]
    expect(args[1]).toBe("t1");
    expect(args[2]).toBe("acp");

    // setOptions({ threadId }) was applied after the swap.
    const after = getCaptured<ChatCaptured>("ChatSolid");
    expect(after?.threadId).toBe("t1");
  });

  it("forwards onOpenFile to the host callback (ref-stable)", async () => {
    mockFetchOk();
    const onOpenFile = vi.fn();
    render(
      <ChatSolidBridge
        threadId="t1"
        sessionName="proj"
        onOpenFile={onOpenFile}
      />,
    );
    const opts = await waitForCapture<ChatCaptured>("ChatSolid");
    const meta = { href: "src/app.ts" };
    opts.onOpenFile!(meta);
    expect(onOpenFile).toHaveBeenCalledWith(meta);
  });

  it("forwards onClose to the host when provided (W1)", async () => {
    mockFetchOk();
    const onClose = vi.fn();
    render(
      <ChatSolidBridge
        threadId="t1"
        sessionName="proj"
        onClose={onClose}
      />,
    );
    const opts = await waitForCapture<ChatCaptured>("ChatSolid");
    expect(typeof opts.onClose).toBe("function");
    opts.onClose!();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits onClose from mount opts when the host doesn't provide one (W1)", async () => {
    mockFetchOk();
    render(<ChatSolidBridge threadId="t1" sessionName="proj" />);
    const opts = await waitForCapture<ChatCaptured>("ChatSolid");
    // The bridge installs a ref-indirect onClose at mount-time (so a
    // host that swaps in onClose later doesn't need a remount). The
    // hot-toggle effect calls setOptions({ onClose: undefined }) when
    // the host doesn't provide one, which cleanly suppresses the
    // Close affordance in chat-solid's header.
    expect(opts.onClose).toBeUndefined();
  });
});
