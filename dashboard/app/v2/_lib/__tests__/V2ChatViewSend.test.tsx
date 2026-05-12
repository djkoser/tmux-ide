import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  chatThreadList: vi.fn(async () => ({ threads: [] })),
  chatProvidersList: vi.fn(async () => ({ providers: [] })),
  chatThreadCreate: vi.fn(async () => ({ thread: null, state: null })),
  chatThreadDelete: vi.fn(async () => ({})),
  chatSessionSend: vi.fn(async () => ({ accepted: true as const, promptId: "p-1" })),
}));

import * as api from "@/lib/api";
const sendMock = vi.mocked(api.chatSessionSend);

vi.mock("@/lib/wsBus", () => ({
  subscribeSession: vi.fn(() => () => undefined),
}));

vi.mock("@/lib/appProtocol", () => ({
  resolveApiBase: () => "http://localhost",
  resolveAuthToken: () => null,
  withWsBase: (path: string) => `ws://localhost${path}`,
}));

vi.mock("@tmux-ide/chat-solid", () => ({
  mount: () => ({ unmount: () => undefined, setThreadId: () => undefined }),
}));

// ChatV2Root is the seam — surface its onSend prop via a recording stub so we
// can assert V2ChatView wires onSend → chatSessionSend with the active thread.
const lastProps: { current: any } = { current: null };
vi.mock("@/components/chat-v2", () => ({
  ChatV2Root: (props: any) => {
    lastProps.current = props;
    return null;
  },
}));

import { render, cleanup, act } from "@testing-library/react";
import { V2ChatView } from "@/app/v2/_lib/V2ChatView";

afterEach(() => {
  cleanup();
  sendMock.mockClear();
  lastProps.current = null;
});

beforeEach(() => {
  // Force the v2 branch so ChatV2Root mounts.
});

describe("V2ChatView :: onSend wiring (T085 fix #1)", () => {
  it("invokes chatSessionSend with active thread + content on submit", async () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v2" />);
    expect(lastProps.current).not.toBeNull();
    await act(async () => {
      lastProps.current.onSend("thread-42", "hello world");
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      threadId: "thread-42",
      text: "hello world",
    });
  });

  it("trims whitespace before calling chatSessionSend", async () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v2" />);
    await act(async () => {
      lastProps.current.onSend("thread-42", "   padded   ");
    });
    expect(sendMock).toHaveBeenCalledWith({
      threadId: "thread-42",
      text: "padded",
    });
  });

  it("skips the call entirely when the text is empty / whitespace-only", async () => {
    render(<V2ChatView projectName="demo" chatVersionOverride="v2" />);
    await act(async () => {
      lastProps.current.onSend("thread-42", "   ");
    });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
