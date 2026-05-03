import type { ReactNode } from "react";

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  testId?: string;
  className?: string;
}

export function Stat({ label, value, color, testId = "stat", className = "" }: StatProps) {
  return (
    <div data-testid={testId} className={`min-w-0 ${className}`}>
      <div className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
        {label}
      </div>
      <div className="truncate text-[13px] tabular-nums" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </div>
    </div>
  );
}
