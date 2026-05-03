import type { CSSProperties } from "react";

export type StatusPillVariant =
  | "passing"
  | "failing"
  | "pending"
  | "blocked"
  | "active"
  | "done"
  | "archived"
  | "info"
  | "warning"
  | "error"
  | "success";

const VARIANT_STYLES: Record<
  StatusPillVariant,
  { color: string; background: string; dot: string }
> = {
  passing: { color: "var(--green)", background: "rgba(155, 205, 151, 0.1)", dot: "var(--green)" },
  failing: { color: "var(--red)", background: "rgba(252, 83, 58, 0.1)", dot: "var(--red)" },
  pending: { color: "var(--dim)", background: "var(--surface)", dot: "var(--dim)" },
  blocked: { color: "var(--yellow)", background: "rgba(252, 213, 58, 0.1)", dot: "var(--yellow)" },
  active: { color: "var(--accent)", background: "rgba(91, 192, 222, 0.1)", dot: "var(--accent)" },
  done: { color: "var(--green)", background: "rgba(155, 205, 151, 0.1)", dot: "var(--green)" },
  archived: { color: "var(--dimmer)", background: "var(--surface)", dot: "var(--dimmer)" },
  info: { color: "var(--cyan)", background: "rgba(86, 182, 194, 0.1)", dot: "var(--cyan)" },
  warning: { color: "var(--yellow)", background: "rgba(252, 213, 58, 0.1)", dot: "var(--yellow)" },
  error: { color: "var(--red)", background: "rgba(252, 83, 58, 0.1)", dot: "var(--red)" },
  success: { color: "var(--green)", background: "rgba(155, 205, 151, 0.1)", dot: "var(--green)" },
};

export interface StatusPillProps {
  variant: StatusPillVariant;
  label?: string;
  dot?: boolean;
  testId?: string;
  className?: string;
  style?: CSSProperties;
}

export function StatusPill({
  variant,
  label,
  dot = true,
  testId = "status-pill",
  className = "",
  style,
}: StatusPillProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <span
      data-testid={testId}
      data-variant={variant}
      className={`inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-[10px] uppercase tracking-wide ${className}`}
      style={{ color: styles.color, background: styles.background, ...style }}
    >
      {dot && (
        <span
          data-testid={`${testId}-dot`}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: styles.dot }}
          aria-hidden="true"
        />
      )}
      {label ?? variant}
    </span>
  );
}
