import { z } from "zod";

/** How the whole page looks: one accent colour, a font pair, corner radius and spacing. */
export const themeSchema = z.object({
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  fontPair: z.enum(["sans", "grotesk", "serif"]),
  radius: z.enum(["none", "sm", "md"]),
  density: z.enum(["compact", "normal", "spacious"]),
});

export type PageTheme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: PageTheme = {
  accent: "#4dff2a",
  fontPair: "grotesk",
  radius: "md",
  density: "normal",
};

export const FONT_PAIRS: { value: PageTheme["fontPair"]; label: string }[] = [
  { value: "grotesk", label: "Action Tokens" },
  { value: "sans", label: "Clean sans" },
  { value: "serif", label: "Editorial serif" },
];
export const RADII: { value: PageTheme["radius"]; label: string }[] = [
  { value: "none", label: "Square" },
  { value: "sm", label: "Soft" },
  { value: "md", label: "Round" },
];
export const DENSITIES: { value: PageTheme["density"]; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Spacious" },
];

const RADIUS = { none: "0px", sm: "6px", md: "16px" } as const;
const GAP = { compact: "0.75rem", normal: "1.25rem", spacious: "2rem" } as const;
const FONT = {
  grotesk: "var(--font-display), system-ui, sans-serif",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
} as const;

/** Black or white, whichever reads on top of the accent colour. */
export function inkFor(hex: string): "#0c0d05" | "#ffffff" {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.35 ? "#0c0d05" : "#ffffff";
}

/** The theme as CSS custom properties; blocks read `var(--page-*)` so nothing passes the theme around. */
export function themeVars(theme: PageTheme): Record<string, string> {
  return {
    "--page-accent": theme.accent,
    "--page-accent-ink": inkFor(theme.accent),
    "--page-radius": RADIUS[theme.radius],
    "--page-gap": GAP[theme.density],
    "--page-font": FONT[theme.fontPair],
  };
}
