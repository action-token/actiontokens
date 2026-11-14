import { motion } from "framer-motion";
import { Check, Lock, Zap } from "lucide-react";

import { pinStatus, RARITY_META } from "@bandcoin/ar-core/ar/rarity";
import type { ArPin } from "@bandcoin/ar-core/ar/types";
import { shapeScale } from "@bandcoin/ar-core/shape-size";
import { cn } from "@bandcoin/ui/lib/cn";
import { PinGlyph } from "@bandcoin/ui/patterns/pin-glyph";

/**
 * ── PinMarker ──────────────────────────────────────────────────────────────
 *
 * The pin drawn in its own shape (artist's picture, pin picture or a colour inside it), ringed in
 * its rarity colour and standing on a ground shadow so it reads as an object placed on the map
 * rather than a dot drawn onto it.
 *
 * States read at a glance, with the same opacities as the brand portal:
 *   available             100%  (sonar ring + floating when in range)
 *   collected by you       80%  gold tick
 *   locked (tier)          60%  padlock
 *   expired / all claimed  40%  desaturated, no glow
 * A ⚡ flag says it collects itself (auto-collect).
 *
 * `inRange` is passed in rather than computed here because the map already
 * knows the distance to every pin and recomputing per marker per frame would
 * be the single most expensive thing on the screen.
 */
export function PinMarker({
  pin,
  selected,
  inRange,
  onSelect,
}: {
  pin: ArPin;
  selected: boolean;
  inRange: boolean;
  onSelect: () => void;
}) {
  const rarity = pin.rarity;
  const status = pinStatus(pin);
  const meta = RARITY_META[rarity];

  const live = status === "collectible";
  const dead =
    status === "expired" ||
    status === "depleted" ||
    (pin.endsAt != null && new Date(pin.endsAt).getTime() < Date.now());
  const ring = dead ? "var(--ar-locked)" : meta.hsl;
  // First match wins: expired beats collected, so an old pin you collected still reads as over.
  const opacity = dead
    ? "opacity-40"
    : status === "locked"
      ? "opacity-60"
      : status === "collected"
        ? "opacity-80"
        : "opacity-100";
  const outer = "rounded-full";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${pin.title} — ${pin.artistName}`}
      className="group relative flex h-[58px] w-[52px] cursor-pointer items-start justify-center focus-visible:outline-hidden"
    >
      {/* Ground shadow. Tightens when the medallion is grounded (out of
          range), which is what sells the height difference. */}
      <span
        aria-hidden
        className={cn(
          "absolute bottom-[2px] left-1/2 h-[5px] -translate-x-1/2 rounded-[50%] bg-black/60 blur-[3px] transition-all",
          inRange && live ? "w-[22px] opacity-50" : "w-[28px] opacity-75",
        )}
      />

      <motion.span
        className="relative block"
        animate={inRange && live ? { y: [0, -5, 0] } : { y: 0 }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        whileTap={{ scale: 0.9 }}
      >
        {/* Sonar — only for something you can actually capture right now. */}
        {live && inRange && (
          <>
            <span
              aria-hidden
              className={cn("animate-pulse-ring absolute inset-0 border-2", outer)}
              style={{ borderColor: `hsl(${meta.hsl})` }}
            />
            <span
              aria-hidden
              className={cn("animate-pulse-ring absolute inset-0 border", outer)}
              style={{
                borderColor: `hsl(${meta.hsl})`,
                animationDelay: "1.1s",
              }}
            />
          </>
        )}

        {/* The pin, in its own shape, outlined in its rarity colour (plan 43) */}
        <motion.span
          animate={{ scale: selected ? 1.22 : 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 24 }}
          className={cn(
            "relative block h-[46px] w-[46px] transition-opacity",
            opacity,
            dead && "saturate-0",
          )}
          style={{
            filter: selected
              ? `drop-shadow(0 0 10px hsl(${ring} / 0.95))`
              : live
                ? `drop-shadow(0 0 6px hsl(${ring} / 0.7))`
                : undefined,
          }}
        >
          <PinGlyph
            path={pin.look.path}
            size={Math.round(46 * shapeScale(pin.look.path))}
            color={pin.look.color}
            defaultColor="hsl(var(--ar-surface-3))"
            imageUrl={pin.look.imageUrl}
            imageFit={pin.look.imageFit}
            ringColor={`hsl(${ring})`}
            ringWidth={selected ? 3.5 : 2.5}
            placeholder={
              <span className="font-hud text-[15px] font-bold">{pin.artistName.charAt(0)}</span>
            }
          />

          {/* Corner flag */}
          {status === "collected" && <CornerFlag tone="gold" Icon={Check} />}
          {status === "locked" && <CornerFlag tone="muted" Icon={Lock} />}
          {live && pin.look.autoBadge && <CornerFlag tone="accent" Icon={Zap} />}
        </motion.span>

        {/* Stem — the medallion stands on a point, like a map pin should. */}
        <span
          aria-hidden
          hidden={pin.look.anchor === "bottom"}
          className="absolute -bottom-[5px] left-1/2 h-[9px] w-[2px] -translate-x-1/2 rounded-full"
          style={{
            background: `linear-gradient(180deg, hsl(${ring}), transparent)`,
            opacity: dead ? 0.3 : 0.85,
          }}
        />
      </motion.span>
    </button>
  );
}

function CornerFlag({ tone, Icon }: { tone: "gold" | "accent" | "muted"; Icon: typeof Check }) {
  const cls = {
    gold: "bg-rarity-legendary text-[hsl(30_90%_10%)]",
    accent: "bg-ar-accent text-ar-accent-ink",
    muted: "bg-ar-surface-3 text-ar-faint border border-ar-line-bright",
  }[tone];

  return (
    <span
      className={cn(
        "absolute -top-[5px] -right-[5px] flex h-[17px] w-[17px] items-center justify-center rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.8)]",
        cls,
      )}
    >
      <Icon size={10} strokeWidth={3.4} />
    </span>
  );
}
