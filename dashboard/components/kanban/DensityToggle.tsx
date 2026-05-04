"use client";

import { Rows3, Rows4 } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import type { Density } from "./kanban-types";

interface DensityToggleProps {
  value: Density;
  onChange: (next: Density) => void;
}

export function DensityToggle({ value, onChange }: DensityToggleProps) {
  const next: Density = value === "comfortable" ? "compact" : "comfortable";
  const Icon = value === "comfortable" ? Rows3 : Rows4;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            data-testid="kanban-density-toggle"
            data-density={value}
            onClick={() => onChange(next)}
            aria-label={`Switch to ${next} density`}
          >
            <Icon aria-hidden="true" size={13} />
          </Button>
        }
      />
      <TooltipContent side="bottom">{value === "comfortable" ? "Comfortable" : "Compact"}</TooltipContent>
    </Tooltip>
  );
}
