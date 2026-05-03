import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  testId?: string;
  className?: string;
}

export function EmptyState({
  title,
  body,
  action,
  testId = "empty-state",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={`flex min-h-20 flex-col items-center justify-center px-6 py-10 text-center ${className}`}
    >
      <div className="text-[13px] text-[var(--fg)]">{title}</div>
      {body && <div className="mt-1 max-w-md text-[11px] leading-5 text-[var(--dim)]">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
