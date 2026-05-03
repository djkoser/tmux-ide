"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/useSettings";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const { themeId, setThemeId } = useSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — render nothing until mounted
  if (!mounted) return <span className="w-4" />;

  const isDark = themeId !== "light";
  const next = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setThemeId(next);
        setTheme(next);
      }}
      className="inline-flex h-5 w-5 items-center justify-center text-[var(--dim)] transition-colors motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-[0.95] hover:text-[var(--fg)]"
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun aria-hidden="true" size={13} /> : <Moon aria-hidden="true" size={13} />}
    </button>
  );
}
