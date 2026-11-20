import type { ReactNode } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

/**
 * Shared bits for the layout review page: dummy data, a phone frame, a fake map and
 * placeholder art. Nothing here talks to the API; every concept renders the same data so
 * only the layout differs.
 */

export const GREEN = "#4dff2a";

export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

export const RARITY: Record<Rarity, string> = {
  Common: "#9aa59a",
  Rare: "#38bdf8",
  Epic: "#c084fc",
  Legendary: "#fbbf24",
};

export const ITEMS: {
  id: string;
  name: string;
  artist: string;
  rarity: Rarity;
  distance: string;
  art: string;
}[] = [
  {
    id: "001",
    name: "Neon Koi",
    artist: "MURO",
    rarity: "Rare",
    distance: "120 m",
    art: "linear-gradient(135deg,#0f3d2e,#4dff2a 140%)",
  },
  {
    id: "002",
    name: "Night Shift",
    artist: "Kaya Beats",
    rarity: "Epic",
    distance: "340 m",
    art: "linear-gradient(160deg,#2a0f3d,#c084fc 150%)",
  },
  {
    id: "003",
    name: "Gold Tooth",
    artist: "DJ Rafi",
    rarity: "Legendary",
    distance: "1.2 km",
    art: "linear-gradient(200deg,#3d2a0f,#fbbf24 150%)",
  },
  {
    id: "004",
    name: "Block Party",
    artist: "Crew 88",
    rarity: "Common",
    distance: "2.4 km",
    art: "linear-gradient(120deg,#1a1f1a,#9aa59a 170%)",
  },
  {
    id: "005",
    name: "Tidewater",
    artist: "Lune",
    rarity: "Rare",
    distance: "3.1 km",
    art: "linear-gradient(150deg,#0f2a3d,#38bdf8 150%)",
  },
  {
    id: "006",
    name: "Static Bloom",
    artist: "MURO",
    rarity: "Epic",
    distance: "4.0 km",
    art: "linear-gradient(110deg,#2a0f2a,#f472b6 160%)",
  },
];

/** Pin positions on the fake map, in % of its box. */
export const PINS = [
  { x: 28, y: 30, rarity: "Rare" as Rarity },
  { x: 66, y: 22, rarity: "Epic" as Rarity },
  { x: 74, y: 52, rarity: "Legendary" as Rarity },
  { x: 22, y: 62, rarity: "Common" as Rarity },
  { x: 52, y: 70, rarity: "Rare" as Rarity },
];

/** A phone-shaped frame, 300×620, with an optional status bar. */
export function Phone({
  children,
  label,
  className,
  statusBar = true,
  statusTone = "light",
}: {
  children: ReactNode;
  label: string;
  className?: string;
  statusBar?: boolean;
  statusTone?: "light" | "dark";
}) {
  return (
    <figure className="flex shrink-0 flex-col items-center gap-3">
      <div className="relative h-[620px] w-[300px] rounded-[44px] border border-white/10 bg-[#0b0d0b] p-[9px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
        <div
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden rounded-[36px]",
            className,
          )}
        >
          {statusBar && (
            <div
              className={cn(
                "relative z-30 flex h-9 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold",
                statusTone === "light" ? "text-white" : "text-black",
              )}
            >
              <span>21:27</span>
              <span className="absolute top-2 left-1/2 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-[2px] bg-current opacity-80" />
                <span className="h-2 w-4 rounded-[2px] border border-current opacity-80" />
              </span>
            </div>
          )}
          {children}
        </div>
      </div>
      <figcaption className="text-[12px] tracking-[0.14em] text-white/50 uppercase">
        {label}
      </figcaption>
    </figure>
  );
}

/** A dark stylised street map, drawn with SVG, with pins on top. */
export function FakeMap({
  className,
  tone = "dark",
  pin,
}: {
  className?: string;
  tone?: "dark" | "ink";
  pin: (p: (typeof PINS)[number], i: number) => ReactNode;
}) {
  const road = tone === "ink" ? "#1d241d" : "#151a15";
  const major = tone === "ink" ? "#263026" : "#1d241d";
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        tone === "ink" ? "bg-[#0a0d0a]" : "bg-[#070907]",
        className,
      )}
    >
      <svg viewBox="0 0 300 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <rect x="190" y="300" width="90" height="70" rx="6" fill="#0c140c" />
        <rect x="30" y="120" width="70" height="50" rx="6" fill="#0c140c" />
        <path d="M-10 420 C 80 380, 160 470, 320 400" stroke="#0d1a24" strokeWidth="26" fill="none" />
        {[60, 140, 230, 310, 380, 470, 540].map((y) => (
          <line key={`h${y}`} x1="0" x2="300" y1={y} y2={y + 14} stroke={road} strokeWidth="5" />
        ))}
        {[40, 110, 180, 250].map((x) => (
          <line key={`v${x}`} x1={x} x2={x - 18} y1="0" y2="600" stroke={road} strokeWidth="5" />
        ))}
        <line x1="0" x2="300" y1="260" y2="200" stroke={major} strokeWidth="11" />
        <line x1="150" x2="120" y1="0" y2="600" stroke={major} strokeWidth="11" />
      </svg>
      {PINS.map((p, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          {pin(p, i)}
        </div>
      ))}
    </div>
  );
}

/** Placeholder artwork for a collectible: the gradient plus a soft shape. */
export function Art({ art, className }: { art: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: art }}>
      <span className="absolute -right-4 -bottom-6 size-20 rounded-full bg-white/15 blur-[2px]" />
      <span className="absolute top-3 left-3 size-6 rounded-full border-2 border-white/30" />
    </div>
  );
}
