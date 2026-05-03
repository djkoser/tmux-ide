"use client";

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
      onClick={() => {
        setThemeId(next);
        setTheme(next);
      }}
      className="text-[var(--dim)] hover:text-[var(--fg)] transition-colors"
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}
