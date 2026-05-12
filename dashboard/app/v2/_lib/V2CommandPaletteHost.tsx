"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  openCommandPalette,
} from "@/components/CommandPalette";
import { registerAction } from "@/lib/actions";
import { useKeybind } from "@/lib/useKeybinds";

export function V2CommandPaletteHost() {
  const router = useRouter();

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

  return <CommandPalette />;
}
