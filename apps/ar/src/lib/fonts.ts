import { Barlow, Teko } from "next/font/google";

/**
 * AR's type pair, matching the rest of Bandcoin: Teko (condensed) for HUD
 * chrome, Barlow for prose. Both are narrower than the Wadzzo pair the ported
 * screens were sized for (Chakra Petch, Sora), so nothing overflows.
 */
const display = Teko({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-display",
});
const body = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-body",
});

/** Font variables for <html>. */
export const fontVariables = `${display.variable} ${body.variable}`;
