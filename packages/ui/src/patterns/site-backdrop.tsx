import type { CSSProperties } from "react";

import { cn } from "../lib/cn";

/**
 * The shapes, as stencils in public/images: each is solid where it should show. One entry per
 * shape: where it sits, how big, and whether it repeats sideways.
 */
const SHAPES = [
  // bandfan's electric guitar, leaning in on the left, clear of the sidebar
  {
    src: "/images/guitar.svg",
    position: "left calc(var(--side-w) + 3vmin) top 6vmin",
    size: "74vmin 74vmin",
    repeat: "no-repeat",
  },
  // the ACTION pick (tilt baked in, lettering cut out), off the bottom-right corner
  {
    src: "/images/logo-mark.png",
    position: "right -16vmin bottom -14vmin",
    size: "auto 108vmin",
    repeat: "no-repeat",
  },
] as const;

/** Every shape cut into one layer (CSS draws a list of masks as their union). */
const MASK: CSSProperties = {
  maskImage: SHAPES.map((s) => `url(${s.src})`).join(", "),
  WebkitMaskImage: SHAPES.map((s) => `url(${s.src})`).join(", "),
  maskPosition: SHAPES.map((s) => s.position).join(", "),
  WebkitMaskPosition: SHAPES.map((s) => s.position).join(", "),
  maskSize: SHAPES.map((s) => s.size).join(", "),
  WebkitMaskSize: SHAPES.map((s) => s.size).join(", "),
  maskRepeat: SHAPES.map((s) => s.repeat).join(", "),
  WebkitMaskRepeat: SHAPES.map((s) => s.repeat).join(", "),
};

/** Bottom to top: the base colour, then two copies that fade in over it in turn. */
const LAYERS = [
  { color: "var(--bc-mark-a)", animation: undefined },
  { color: "var(--bc-mark-b)", animation: "animate-mark-b" },
  { color: "var(--bc-mark-c)", animation: "animate-mark-c" },
] as const;

/**
 * The background behind every page: a guitar on the left and the ACTION pick on the right,
 * slowly shifting between the brand yellow, teal and violet. A faint watermark in the dark theme, a soft tint in the
 * light one (--bc-mark sets how strong).
 *
 * Cheap to run: both shapes share three full-screen layers, each drawn once; the colour change
 * is only two of them fading in and out, which the browser blends without repainting. Still for
 * people who ask for less motion.
 */
export function SiteBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-(--bc-mark) [contain:strict]"
    >
      {LAYERS.map(({ color, animation }) => (
        <div
          key={color}
          className={cn("absolute inset-0 motion-reduce:animate-none", animation)}
          style={{ ...MASK, backgroundColor: color }}
        />
      ))}
    </div>
  );
}
