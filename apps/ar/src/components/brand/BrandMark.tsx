import { motion, type MotionProps } from "framer-motion";
import { site } from "@actiontokens/ar-core/site";

/**
 * ── BrandMark ─────────────────────────────────────────────────────────────
 *
 * The Action Tokens guitar-pick mark (`public/brand/actiontokens-mark.png`), as a
 * `motion.img` so the boot sequence can scale, glow and animate it.
 */
export function BrandMark({
  className,
  glow = false,
  ...motionProps
}: {
  className?: string;
  /** Adds the app's standard accent glow (matches `.text-glow` on text). */
  glow?: boolean;
} & MotionProps) {
  return (
    <motion.img
      src={site.assets.mark}
      alt={site.name}
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 16px hsl(var(--ar-accent) / 0.75))" } : undefined}
      {...motionProps}
    />
  );
}
