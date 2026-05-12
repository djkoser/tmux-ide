// Icons kept: all four are returned uniformly as a `LucideIcon` from providerConfig() and rendered through a parameterized `Icon` variable; swapping any to a glyph would require changing the return shape and adding render branches.
import { Bot, Code2, Sparkles, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProvider } from "./types";

interface ProviderBadgeProps {
  provider: AgentProvider;
  className?: string;
}

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  const config = providerConfig(provider);
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--border-weak)] bg-[var(--surface)] px-2 text-[11px] text-[var(--fg-secondary)]",
        className,
      )}
      title={config.title}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{config.label}</span>
    </span>
  );
}

function providerConfig(provider: AgentProvider) {
  switch (provider.kind) {
    case "claude-code":
      return { label: "Claude", title: "Claude Code ACP", icon: Sparkles };
    case "codex":
      return { label: "Codex", title: "Codex ACP", icon: Code2 };
    case "gemini":
      return { label: "Gemini", title: "Gemini ACP", icon: Bot };
    case "custom":
      return { label: "Custom", title: provider.command, icon: Terminal };
  }
}
