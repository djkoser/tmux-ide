"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface StatusPopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function StatusPopover({ open, onClose, children }: StatusPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      data-testid="status-popover"
      className="absolute bottom-full left-0 z-40 mb-1 max-h-72 min-w-64 max-w-[min(28rem,calc(100vw-2rem))] overflow-auto border border-[var(--border)] bg-[var(--surface)] p-2 text-[11px] text-[var(--fg)] shadow-lg"
    >
      {children}
    </div>
  );
}
