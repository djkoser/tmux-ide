import type { TmuxIdeRuntime } from "@/lib/appProtocol";

declare global {
  type TmuxIdeMenuChannel = "menu:add-project" | "menu:open-settings";

  interface Window {
    __TMUX_IDE__?: TmuxIdeRuntime;
  }
}

export {};
