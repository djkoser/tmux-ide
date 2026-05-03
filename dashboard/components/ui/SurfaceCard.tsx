import type { ReactNode } from "react";

export interface SurfaceCardProps {
  children: ReactNode;
  padded?: "sm" | "md" | false;
  bordered?: boolean;
  testId?: string;
  className?: string;
}

export function SurfaceCard({
  children,
  padded = "sm",
  bordered = true,
  testId = "surface-card",
  className = "",
}: SurfaceCardProps) {
  const padding = padded === "md" ? "p-4" : padded === "sm" ? "p-3" : "";
  const border = bordered ? "border border-[var(--border-weak)]" : "";
  return (
    <div
      data-testid={testId}
      className={`rounded-md ${border} bg-[var(--bg-strong)] ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
