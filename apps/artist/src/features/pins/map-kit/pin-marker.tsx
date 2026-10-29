"use client";

import { Calendar, MapPin, Rocket, Star, Target, type LucideIcon } from "lucide-react";
import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";

import { cn } from "@bandcoin/ui/lib/cn";

export type PinLook = "hidden" | "expired" | "collected" | "scheduled" | "active";

/** Which pin kinds get their own icon when there's no cover image. */
export const pinIcon = (type: string): LucideIcon =>
  ({ BOUNTY: Target, EVENT: Calendar, EXPERIENCE: Star, LAUNCH: Rocket })[type] ?? MapPin;

/** The first matching state wins; the server works out the status. */
export const pinLook = (
  status: "HIDDEN" | "SCHEDULED" | "LIVE" | "ENDED" | "ALL_COLLECTED",
): PinLook =>
  (
    ({
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

/** A pin on the map: its image (or kind icon), styled by state, with how many fans collected it. */
export const PinMarker = memo(function PinMarker({
  lat,
  lng,
  image,
  icon: Icon,
  look,
  autoCollect,
  count,
  selected,
  onClick,
  label,
}: {
  lat: number;
  lng: number;
  image?: string | null;
  icon: LucideIcon;
  look: PinLook;
  autoCollect: boolean;
  count: number;
  selected?: boolean;
  onClick?: () => void;
  label: string;
}) {
  const style = PIN_LOOK[look];
  const outer = autoCollect ? "rounded-md" : "rounded-full";
  const inner = autoCollect ? "rounded-[4px]" : "rounded-full";
  return (
    <Marker
      latitude={lat}
      longitude={lng}
      anchor="center"
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onClick?.();
      }}
    >
      <button
        type="button"
        aria-label={`${label}: ${style.label}, ${autoCollect ? "auto-collect" : "tap to collect"}`}
        title={`${label} · ${style.label} · ${autoCollect ? "Auto-collect" : "Tap to collect"}`}
        className={cn(
          "bg-surface relative flex size-11 items-center justify-center border-[2.5px] p-0.5 shadow-md transition-transform hover:scale-110 hover:opacity-100",
          outer,
          style.border,
          style.opacity,
          look === "expired" && "grayscale",
          selected && "ring-primary/40 scale-110 opacity-100 ring-4",
        )}
      >
        {look === "active" && (
          <span
            className={cn("border-primary/40 absolute -inset-[2.5px] animate-ping border-2", outer)}
            aria-hidden
          />
        )}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className={cn("relative size-full object-cover", inner)} />
        ) : (
          <span
            className={cn(
              "bg-surface-2 relative flex size-full items-center justify-center",
              inner,
            )}
          >
            <Icon className="text-fg-muted size-5" />
          </span>
        )}
        {count > 0 && (
          <span className="bg-primary text-primary-ink num absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow">
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
      <div className="text-fg-muted mt-2 flex items-center gap-3 border-t pt-2">
        <span className="flex items-center gap-1.5">
          <span className="border-fg/60 size-3 rounded-full border-2" aria-hidden /> Tap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-fg/60 size-3 rounded-[3px] border-2" aria-hidden /> Auto
        </span>
      </div>
    </div>
  );
}
