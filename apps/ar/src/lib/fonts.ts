import { Chakra_Petch, Sora } from "next/font/google";

/**
 * Wadzzo AR's type pair, so the ported screens keep Wadzzo's sizes and widths:
 * Chakra Petch (condensed) for HUD chrome, Sora for prose. Bandcoin's
 * Unbounded is far wider and overflows the same layouts.
 */
const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-display",
});
const body = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-body",
});

/** Font variables for <html>. */
export const fontVariables = `${display.variable} ${body.variable}`;
