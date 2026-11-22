"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "../lib/cn";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Light, Dark or System, as a small segmented control. */
export function ThemeControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser; until then nothing shows as picked.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : undefined;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("flex rounded-full bg-[var(--ap-fill)] p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "text-fg-muted hover:text-fg flex size-7 items-center justify-center rounded-full transition-colors",
            current === value && "bg-surface-3 text-fg shadow-sm",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
