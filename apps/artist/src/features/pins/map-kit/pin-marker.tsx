"use client";

import { Calendar, MapPin, Rocket, Star, Target, Zap, type LucideIcon } from "lucide-react";
import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";

import type { ResolvedPinLook } from "@bandcoin/ar-core/pin-look";
import { shapeScale } from "@bandcoin/ar-core/shape-size";
import { cn } from "@bandcoin/ui/lib/cn";
import { PinGlyph } from "@bandcoin/ui/patterns/pin-glyph";

export type PinLook = "hidden" | "expired" | "collected" | "scheduled" | "active";

/** Which pin kinds get their own icon when there's no cover image. */
export const pinIcon = (type: string): LucideIcon =>
  ({ BOUNTY: Target, EVENT: Calendar, EXPERIENCE: Star, LAUNCH: Rocket })[type] ?? MapPin;

/** The first matching state wins; the server works out the status. */
export const pinLook = (
  status:
    "IN_REVIEW" | "NOT_APPROVED" | "HIDDEN" | "SCHEDULED" | "LIVE" | "ENDED" | "ALL_COLLECTED",
): PinLook =>
  (
    ({
      // Fans can't see these yet (or at all), so they look like hidden pins.
      IN_REVIEW: "hidden",
      NOT_APPROVED: "hidden",
      HIDDEN: "hidden",
      SCHEDULED: "scheduled",
      LIVE: "active",
      ENDED: "expired",
      ALL_COLLECTED: "collected",
    }) as const
  )[status];

/**
 * One visual language for pins on the map, as in the fan app:
 *   ended 40% grey, scheduled 60% blue, all collected 80% blue, live 100% green with a soft pulse.
 * Shape tells how fans collect it: round = tap to collect, square = auto-collect.
 */
export const PIN_LOOK: Record<PinLook, { label: string; opacity: string; border: string }> = {
  active: { label: "Live", opacity: "opacity-100", border: "border-primary" },
  collected: { label: "All collected", opacity: "opacity-80", border: "border-warning" },
  scheduled: { label: "Scheduled", opacity: "opacity-70", border: "border-info" },
  expired: { label: "Ended", opacity: "opacity-40", border: "border-fg-faint" },
  hidden: { label: "Hidden", opacity: "opacity-40", border: "border-dashed border-danger" },
};

/** The outline colour of each state, as CSS colours for the shape's edge. */
const STATE_RING: Record<PinLook, string> = {
  active: "var(--color-primary)",
  collected: "var(--color-warning)",
  scheduled: "var(--color-info)",
  expired: "var(--color-fg-faint)",
  hidden: "var(--color-danger)",
};

/**
 * A pin on the map, drawn in its own shape (plan 43): the artist's picture, the pin's picture or a
 * colour inside it, an outline in its state's colour, a ⚡ badge when it collects itself, and how
 * many fans collected it.
 */
export const PinMarker = memo(function PinMarker({
  lat,
  lng,
  glyph,
  icon: Icon,
  look,
  count,
  selected,
  onClick,
  label,
}: {
  lat: number;
  lng: number;
  glyph: ResolvedPinLook;
  /** Shown over a plain colour when the shape has no picture */
  icon: LucideIcon;
  look: PinLook;
  count: number;
  selected?: boolean;
  onClick?: () => void;
  label: string;
}) {
  const style = PIN_LOOK[look];
  return (
    <Marker
      latitude={lat}
      longitude={lng}
      anchor={glyph.anchor}
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onClick?.();
      }}
    >
      <button
        type="button"
        aria-label={`${label}: ${style.label}${glyph.autoBadge ? ", auto-collect" : ""}`}
        title={`${label} · ${style.label}${glyph.autoBadge ? " · Auto-collect" : ""}`}
        className={cn(
          "relative block transition-transform hover:scale-110 hover:opacity-100",
          style.opacity,
          look === "expired" && "grayscale",
          selected && "scale-110 opacity-100",
        )}
      >
        {/* Live pins get a still halo; only the chosen one pulses. A pulse on every pin
            keeps the GPU busy for as long as the map is open. */}
        {look === "active" && (
          <span
            className={cn(
              "bg-primary/25 absolute inset-1 rounded-full",
              selected && "animate-ping",
            )}
            aria-hidden
          />
        )}
        <PinGlyph
          path={glyph.path}
          size={Math.round((selected ? 52 : 44) * shapeScale(glyph.path))}
          color={glyph.color}
          defaultColor="var(--color-surface-2)"
          imageUrl={glyph.imageUrl}
          imageFit={glyph.imageFit}
          ringColor={selected ? "var(--color-primary)" : STATE_RING[look]}
          ringWidth={selected ? 3.5 : 2.5}
          badge={glyph.autoBadge}
          placeholder={<Icon className="size-5" />}
        />
        {count > 0 && (
          <span className="bg-primary text-primary-ink num absolute -right-1.5 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </Marker>
  );
});

/** Key for the marker styles. */
export function PinLegend({ className }: { className?: string }) {
  const looks: PinLook[] = ["active", "scheduled", "collected", "expired"];
  return (
    <div
      className={cn(
        "bg-surface/95 border-fg/10 pointer-events-auto rounded-[1.4rem] border-2 p-2.5 text-[11px] shadow-sm",
        className,
      )}
    >
      <ul className="grid gap-1">
        {looks.map((look) => (
          <li key={look} className={cn("flex items-center gap-2", PIN_LOOK[look].opacity)}>
            <span
              className={cn("bg-surface size-3 rounded-full border-2", PIN_LOOK[look].border)}
              aria-hidden
            />
            {PIN_LOOK[look].label}
          </li>
        ))}
      </ul>
      <div className="text-fg-muted mt-2 flex items-center gap-1.5 border-t pt-2">
        <span
          className="flex size-3.5 items-center justify-center rounded-full bg-[#22c55e] text-[#052e16]"
          aria-hidden
        >
          <Zap className="size-2" strokeWidth={3.4} />
        </span>
        Auto-collect
      </div>
    </div>
  );
}
