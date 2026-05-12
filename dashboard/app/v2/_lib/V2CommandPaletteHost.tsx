"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { openCommandPalette } from "@/components/CommandPalette";
import { CommandPaletteBridge } from "@/components/command-palette-bridge";
import { registerAction } from "@/lib/actions";
import { useKeybind } from "@/lib/useKeybinds";

export function V2CommandPaletteHost() {
  const router = useRouter();
  const params = useParams<{ name?: string }>();
  const projectName = (params?.name as string | undefined) ?? null;

  useKeybind("Mod+k", openCommandPalette);

  useEffect(() => {
    const cleanups = [
      registerAction({
        id: "v2.go-overview",
        label: "Go to v2 overview",
        description: "Open the /v2 dashboard overview",
        keywords: ["v2", "overview", "home", "navigate"],
        category: "Navigation",
        run: () => router.push("/v2"),
      }),
      registerAction({
        id: "v2.go-legacy",
        label: "Open old dashboard",
        description: "Switch back to the v1 dashboard at /",
        keywords: ["v1", "old", "legacy", "dashboard"],
        category: "Navigation",
        run: () => router.push("/"),
      }),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [router]);

  return <CommandPaletteBridge projectName={projectName} />;
}
