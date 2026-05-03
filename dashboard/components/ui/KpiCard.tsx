import type { ReactNode } from "react";

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  active?: boolean;
  onClick?: () => void;
  testId?: string;
  className?: string;
}

export function KpiCard({
  label,
  value,
  color,
  active = false,
  onClick,
  testId = "kpi-card",
  className = "",
}: KpiCardProps) {
  const classes = `flex min-w-0 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors ${
    active
      ? "border-[var(--accent)] bg-[var(--surface-active)]"
      : "border-[var(--border-weak)] bg-[var(--bg-strong)] hover:bg-[var(--surface-hover)]"
  } ${onClick ? "cursor-pointer" : ""} ${className}`;

  const content = (
    <>
      <span className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
        {label}
      </span>
      <span className="truncate text-lg tabular-nums" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        data-active={active}
        onClick={onClick}
        className={classes}
      >
        {content}
      </button>
    );
  }

  return (
    <div data-testid={testId} data-active={active} className={classes}>
      {content}
    </div>
  );
}
