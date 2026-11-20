"use client";

import { Palette } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

import { type ThemePreference, useTheme } from "~/lib/ar/theme";

/** Each choice with a tiny swatch of its page, sticker and outline colours. */
const OPTIONS: { value: ThemePreference; label: string; page: string; sticker: string; line: string }[] = [
  { value: "dark", label: "Dark", page: "#050605", sticker: "#0aff54", line: "#f2f7f2" },
  { value: "light", label: "Light", page: "#ecf3ee", sticker: "#00ff4c", line: "#050605" },
  { value: "contrast", label: "High contrast", page: "#000000", sticker: "#29ff69", line: "#ffffff" },
  { value: "auto", label: "Auto", page: "linear-gradient(135deg,#050605 50%,#ecf3ee 50%)", sticker: "#0aff54", line: "#7a857a" },
];

const BODY: Record<ThemePreference, string> = {
  dark: "Neon stickers on a black wall. The home look.",
  light: "The same stickers on a paper wall, for bright daylight.",
  contrast: "Pure black and white, brighter green and heavier outlines. Easiest to read.",
  auto: "Follows your phone: light or dark, and high contrast when it asks for more contrast.",
};

/** Theme picker for the Profile settings: dark, light, high contrast or auto. Saved on this device. */
export function ThemeSetting() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex w-full items-start gap-3 p-3.5">
      <span className="border-ar-accent/50 bg-ar-accent/14 text-ar-accent-hot mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border">
        <Palette size={15} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-hud text-ar-text block text-[12.5px] font-bold tracking-[0.1em] uppercase">
          Theme
        </span>
        <span className="text-ar-faint mt-1 block text-[11.5px] leading-relaxed">{BODY[preference]}</span>
        <div role="radiogroup" aria-label="Theme" className="mt-3 grid grid-cols-2 gap-2">
          {OPTIONS.map(({ value, label, page, sticker, line }) => {
            const active = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(value)}
                className={cn(
                  "flex items-center gap-2 rounded-[10px] border-2 px-2 py-2 text-left transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                  active
                    ? "border-[hsl(var(--st-ink))] bg-ar-accent text-[hsl(var(--st-ink))] shadow-[3px_3px_0_0_hsl(var(--st-line))]"
                    : "bg-ar-surface text-ar-dim border-[hsl(var(--st-line)/0.6)]",
                )}
              >
                <span
                  aria-hidden
                  className="relative flex size-6 shrink-0 items-center justify-center rounded-[6px] border-2"
                  style={{ background: page, borderColor: line }}
                >
                  <span className="size-2.5 rounded-full border border-black" style={{ background: sticker }} />
                </span>
                <span className="font-display min-w-0 text-[9px] leading-tight uppercase">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
