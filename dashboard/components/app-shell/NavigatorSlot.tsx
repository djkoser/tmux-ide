"use client";

import { Panel } from "@/components/ui/panel";
import { NAVIGATOR_WIDTH } from "@/lib/panel-constants";
import { useNavigatorSlot } from "@/lib/useNavigatorSlot";

interface NavigatorSlotProps {
  /** Mobile breakpoint check — when hidden, the slot collapses to nothing. */
  hidden?: boolean;
  className?: string;
}

/**
 * Renders the active navigator (registered via <NavigatorPortal>) in a
 * fixed-width column. When no view registers a navigator, the slot renders
 * nothing — no width, no border — so the surrounding flex chain stays clean.
 *
 * The column itself is a Panel (variant="shrink", width=NAVIGATOR_WIDTH);
 * the registered subtree owns its own header/body styling.
 */
export function NavigatorSlot({ hidden, className }: NavigatorSlotProps) {
  const node = useNavigatorSlot();

  if (!node || hidden) return null;

  return (
    <Panel
      variant="shrink"
      width={NAVIGATOR_WIDTH}
      testId="navigator-slot"
      className={className}
    >
      {node}
    </Panel>
  );
}
