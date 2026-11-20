import { Image as ImageIcon, Lock, QrCode, Satellite } from "lucide-react";
import { type ReactNode } from "react";

import { RARITY_META, STATUS_META } from "@actiontokens/ar-core/ar/rarity";
import type { DetectionMethod, PinStatus, Rarity } from "@actiontokens/ar-core/ar/types";
import { cn } from "@actiontokens/ui/lib/cn";

/**
 * Rarity plate — the small hard-edged tag in the corner of every card.
 * Mythic is the only one that gets a moving gradient; if everything shimmers,
 * nothing does.
 */
export function RarityPlate({
  rarity,
  size = "md",
  showLabel = true,
}: {
  rarity: Rarity;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const meta = RARITY_META[rarity];
  const mythic = rarity === "mythic";

  return (
    <span
      className={cn(
        "font-display inline-flex items-center gap-1 rounded-[4px] border-2 leading-none tracking-[0.08em] uppercase",
        size === "sm" ? "h-[18px] px-1.5 text-[8.5px]" : "h-[22px] px-2 text-[10px]",
        mythic && "animate-gradient-x bg-[length:200%_200%]",
      )}
      style={{
        borderColor: "hsl(var(--st-ink))",
        color: "hsl(var(--st-ink))",
        background: mythic
          ? "linear-gradient(90deg,hsl(var(--rarity-mythic)/0.85),hsl(var(--rarity-legendary)/0.85),hsl(var(--rarity-rare)/0.85),hsl(var(--rarity-mythic)/0.85))"
          : `hsl(${meta.hsl})`,
        boxShadow: "2px 2px 0 0 hsl(var(--st-ink))",
      }}
    >
      <span>{meta.short}</span>
      {showLabel && <span className="tracking-[0.1em]">{meta.label}</span>}
    </span>
  );
}

const TONE: Record<string, string> = {
  accent: "border-[hsl(var(--st-ink))] bg-ar-accent text-[hsl(var(--st-ink))]",
  gold: "border-[hsl(var(--st-ink))] bg-rarity-legendary text-[hsl(var(--st-ink))]",
  danger: "border-[hsl(var(--st-ink))] bg-ar-danger text-white",
  muted: "border-[hsl(var(--st-line)/0.7)] bg-ar-surface text-ar-dim",
};

export function StatusBadge({ status, className }: { status: PinStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "font-display inline-flex h-[22px] items-center gap-1.5 rounded-[4px] border-2 px-2 text-[10.5px] tracking-[0.08em] uppercase shadow-[2px_2px_0_0_hsl(var(--st-ink))]",
        TONE[meta.tone],
        className,
      )}
    >
      {status === "collectible" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-[hsl(var(--st-ink))]" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-[hsl(var(--st-ink))]" />
        </span>
      )}
      {status === "locked" && <Lock size={10} strokeWidth={2.6} />}
      {meta.label}
    </span>
  );
}

const DETECTION_META: Record<
  DetectionMethod,
  { label: string; icon: typeof QrCode; hint: string }
> = {
  gps: {
    label: "GPS",
    icon: Satellite,
    hint: "Unlocks when you're inside the radius. Best in open outdoor space.",
  },
  qr: {
    label: "QR",
    icon: QrCode,
    hint: "Scan the code on the sign. Works indoors, no location permission needed.",
  },
  image: {
    label: "Scan",
    icon: ImageIcon,
    hint: "Point your camera at the object itself — no sign to find.",
  },
};

export { DETECTION_META };

export function DetectionBadge({
  method,
  className,
}: {
  method: DetectionMethod;
  className?: string;
}) {
  const meta = DETECTION_META[method];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "font-display text-ar-text bg-ar-surface inline-flex h-[22px] items-center gap-1.5 rounded-[4px] border-2 border-[hsl(var(--st-line)/0.75)] px-2 text-[10.5px] tracking-[0.08em] uppercase",
        className,
      )}
    >
      <Icon size={11} strokeWidth={2.4} />
      {meta.label}
    </span>
  );
}

/** Generic pill for categories, filters, and brand tags. */
export function Chip({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "font-display inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border-2 px-3 text-[12px] tracking-[0.06em] uppercase transition-[transform,background-color,color]",
        active
          ? "bg-ar-accent -rotate-2 border-[hsl(var(--st-ink))] text-[hsl(var(--st-ink))] shadow-[2px_2px_0_0_hsl(var(--st-ink))]"
          : "bg-ar-surface text-ar-dim hover:text-ar-text border-[hsl(var(--st-line)/0.6)]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Label + number, used across profile, brand, and collection headers. */
export function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "font-display text-[22px] leading-none tabular-nums",
          accent ? "text-ar-accent" : "text-ar-text",
        )}
      >
        {value}
      </span>
      <span className="font-hud text-ar-faint text-[9px] font-semibold tracking-[0.18em] uppercase">
        {label}
      </span>
    </div>
  );
}
