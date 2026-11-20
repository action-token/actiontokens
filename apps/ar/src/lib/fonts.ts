import {
  Anton,
  Bungee,
  Bungee_Shade,
  Faster_One,
  JetBrains_Mono,
  Onest,
  Silkscreen,
} from "next/font/google";

/**
 * ActionTokens type (docs/PLAN.md §11.3, §12.3; chosen by the owner from docs/mockups/fonts.html):
 *   display  Anton: condensed heavy, for HUD chrome and headlines (fits where Teko did)
 *   body     Onest
 *   mono     JetBrains Mono: prices, counts, countdowns
 *   brand    Bungee: labels, names, buttons that shout
 *   shade    Bungee Shade: the ACTIONTOKENS word, big numbers
 *   neon     Faster One: section labels in neon green
 *   pixel    Silkscreen: the glimmer glyph and tiny HUD tags
 */
const display = Anton({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--nf-display",
});
const body = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-body",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--nf-mono",
});
const brand = Bungee({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--nf-brand",
});
const shade = Bungee_Shade({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--nf-shade",
});
const neon = Faster_One({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--nf-neon",
});
const pixel = Silkscreen({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
  variable: "--nf-pixel",
});

/** Font variables for <html>. */
export const fontVariables = [display, body, mono, brand, shade, neon, pixel]
  .map((font) => font.variable)
  .join(" ");
