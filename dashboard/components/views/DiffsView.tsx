"use client";

import { useSearchParams } from "next/navigation";
import { DiffPanel } from "@/components/DiffPanel";
import { DiffsViewerBridge } from "@/components/diffs-viewer-bridge";
import { Panel } from "@/components/ui";

interface DiffsViewProps {
  sessionName: string;
}

export function DiffsView({ sessionName }: DiffsViewProps) {
  // Feature flag: `?diffs=solid` swaps the React DiffPanel for the Solid
  // widget at @tmux-ide/v2-solid-widgets. Identical data source + visual
  // language; the Solid version adds t3-aligned semantic data-* hooks.
  // Default keeps the React DiffPanel for fallback.
  const searchParams = useSearchParams();
  const useSolid = searchParams?.get("diffs") === "solid";
  return (
    <Panel>
      {useSolid ? (
        <DiffsViewerBridge sessionName={sessionName} />
      ) : (
        <DiffPanel sessionName={sessionName} />
      )}
    </Panel>
  );
}
