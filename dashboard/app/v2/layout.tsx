import type { Metadata } from "next";
import { V2CommandPaletteHost } from "./_lib/V2CommandPaletteHost";

export const metadata: Metadata = {
  title: "tmux-ide v2",
  description: "TUI rebuild of the tmux-ide dashboard",
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden">
      {children}
      <V2CommandPaletteHost />
    </div>
  );
}
