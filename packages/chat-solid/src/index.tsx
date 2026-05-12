import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { ChatThreadView } from "./components/ChatThreadView";
import "./styles.css";
import type { ChatHandle, ChatMountOptions } from "./types";

export type { ChatHandle, ChatMountOptions } from "./types";

export function mount(container: HTMLElement, opts: ChatMountOptions): ChatHandle {
  const [options, setOptions] = createSignal(opts);
  container.classList.add("chat-solid-root");
  const dispose = render(() => <ChatThreadView options={options} />, container);

  return {
    unmount() {
      dispose();
      container.classList.remove("chat-solid-root");
    },
    setThreadId(threadId: string) {
      setOptions((current) => ({ ...current, threadId }));
    },
  };
}
