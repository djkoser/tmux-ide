import type { ReactNode } from "react";

export interface SectionHeaderProps {
  label: ReactNode;
  rightSlot?: ReactNode;
  testId?: string;
  className?: string;
}

export function SectionHeader({
  label,
  rightSlot,
  testId = "section-header",
  className = "",
}: SectionHeaderProps) {
  return (
    <header data-testid={testId} className={`mb-2 flex items-center justify-between ${className}`}>
      <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--accent)]">{label}</h2>
      {rightSlot}
    </header>
  );
}
