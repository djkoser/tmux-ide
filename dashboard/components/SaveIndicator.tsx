"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface SaveIndicatorProps {
  state: "idle" | "saving" | "saved" | "error";
  className?: string;
}

export function SaveIndicator({ state, className = "" }: SaveIndicatorProps) {
  if (state === "idle") return null;

  if (state === "saving") {
    return (
      <span
        data-testid="save-indicator"
        data-state={state}
        className={`inline-flex items-center gap-1 text-[10px] text-[var(--dimmer)] ${className}`}
      >
        <Loader2 aria-hidden="true" size={12} className="motion-safe:animate-spin" />
        saving...
      </span>
    );
  }

  if (state === "saved") {
    return (
      <span
        data-testid="save-indicator"
        data-state={state}
        className={`inline-flex items-center gap-1 text-[10px] text-[var(--green)] motion-safe:transition-opacity motion-safe:duration-150 ${className}`}
      >
        <CheckCircle2 aria-hidden="true" size={12} />
        saved
      </span>
    );
  }

  return (
    <span
      data-testid="save-indicator"
      data-state={state}
      className={`inline-flex items-center gap-1 text-[10px] text-[var(--red)] ${className}`}
    >
      <AlertCircle aria-hidden="true" size={12} />
      save failed
    </span>
  );
}
