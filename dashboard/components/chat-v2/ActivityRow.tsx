/**
 * Single row in the activity stream. The visual treatment is driven
 * primarily by `tone` (info / tool / approval / error). `kind` provides
 * the secondary label.
 *
 * The plan-card slot is implemented in TurnBlock — this component only
 * renders the generic row shape. If you need a per-activity rendering
 * shortcut, switch on kind/tone here.
 */

import type { ActivityView } from "./useChatStore";

const TONE_BORDER: Record<ActivityView["tone"], string> = {
  info: "var(--border-weak)",
  tool: "var(--blue)",
  approval: "var(--yellow)",
  error: "var(--red)",
};

const TONE_BG: Record<ActivityView["tone"], string> = {
  info: "transparent",
  tool: "color-mix(in oklch, var(--blue) 8%, transparent)",
  approval: "color-mix(in oklch, var(--yellow) 10%, transparent)",
  error: "color-mix(in oklch, var(--red) 10%, transparent)",
};

export function ActivityRow({ activity }: { activity: ActivityView }) {
  return (
    <div
      data-testid="activity-row"
      data-tone={activity.tone}
      data-kind={activity.kind}
      className="flex items-start gap-2 border-l-2 px-2 py-1 text-[11px] leading-snug"
      style={{
        borderColor: TONE_BORDER[activity.tone],
        backgroundColor: TONE_BG[activity.tone],
      }}
    >
      <span
        className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--dim)]"
        style={{ minWidth: 56 }}
      >
        {activity.kind}
      </span>
      <span className="flex-1 text-[var(--fg-soft)]">{activity.summary}</span>
    </div>
  );
}
