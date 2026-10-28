"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

const OPTIONS = ["system", "dark", "light"] as const;

/** System / Dark / Light segmented switch. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="group" aria-label="Theme" className="bg-surface inline-flex gap-0.5 rounded-full border p-[3px]">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mounted && theme === option}
          onClick={() => setTheme(option)}
          className={cn(
            "text-fg-muted rounded-full px-3 py-1.5 text-[13px] font-semibold capitalize",
            mounted && theme === option && "bg-surface-3 text-fg",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
