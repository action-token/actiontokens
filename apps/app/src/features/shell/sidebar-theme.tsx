"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

const useMounted = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

/** Icon-only theme picker for the sidebar footer, the same as the artist portal's. */
export function SidebarTheme() {
  const { theme: stored, setTheme } = useTheme();
  // next-themes knows the theme only on the client; nothing is selected until then.
  const theme = useMounted() ? stored : undefined;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-surface-2 flex gap-0.5 rounded-full p-0.5"
    >
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={theme === option.id}
          aria-label={option.label}
          title={option.label}
          onClick={() => setTheme(option.id)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors",
            theme === option.id ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
          )}
        >
          <option.icon className="size-3.5" strokeWidth={2.4} />
        </button>
      ))}
    </div>
  );
}
