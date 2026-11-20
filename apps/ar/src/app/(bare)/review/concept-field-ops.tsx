import { Crosshair, LayoutGrid, Map as MapIcon, Music2, ScanLine, ShoppingBag } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

import { Art, FakeMap, GREEN, ITEMS, Phone, RARITY } from "./kit";

/**
 * A — Field Ops: a tactical scanner. Square edges, hairline frames, AR-camera corners, mono
 * readouts, rows instead of cards, and a flat command bar with SCAN as its widest key.
 */

function Corners({ color = GREEN, size = 10 }: { color?: string; size?: number }) {
  const s = { width: size, height: size, borderColor: color };
  return (
    <>
      <span className="absolute top-0 left-0 border-t-2 border-l-2" style={s} />
      <span className="absolute top-0 right-0 border-t-2 border-r-2" style={s} />
      <span className="absolute bottom-0 left-0 border-b-2 border-l-2" style={s} />
      <span className="absolute right-0 bottom-0 border-r-2 border-b-2" style={s} />
    </>
  );
}

function CommandBar({ active }: { active: "map" | "coll" }) {
  const key = (on: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-1 font-mono text-[8.5px] tracking-[0.14em] uppercase",
      on ? "text-[#4dff2a]" : "text-white/40",
    );
  return (
    <div className="relative z-20 grid h-[62px] shrink-0 grid-cols-[1fr_1fr_1.5fr_1fr_1fr] border-t border-[#4dff2a]/25 bg-[#050605] pb-2">
      <div className={key(active === "map")}>
        <MapIcon className="size-4" strokeWidth={1.6} />
        Map
        {active === "map" && <span className="absolute top-0 h-[2px] w-10 bg-[#4dff2a]" />}
      </div>
      <div className={cn(key(active === "coll"), "relative")}>
        <LayoutGrid className="size-4" strokeWidth={1.6} />
        Coll
        {active === "coll" && <span className="absolute top-0 h-[2px] w-10 bg-[#4dff2a]" />}
      </div>
      <div className="relative m-1.5 flex items-center justify-center gap-1.5 bg-[#4dff2a] font-mono text-[11px] font-bold tracking-[0.16em] text-black">
        <ScanLine className="size-4" strokeWidth={2.2} />
        SCAN
      </div>
      <div className={key(false)}>
        <ShoppingBag className="size-4" strokeWidth={1.6} />
        Mkt
      </div>
      <div className={key(false)}>
        <Music2 className="size-4" strokeWidth={1.6} />
        Artists
      </div>
    </div>
  );
}

function MapScreen() {
  const target = ITEMS[0]!;
  return (
    <Phone label="A · Map" className="bg-[#050605]">
      <FakeMap
        pin={(p, i) => (
          <div className="flex flex-col items-center gap-1">
            <span
              className="block size-3.5 rotate-45 border-2 bg-black"
              style={{ borderColor: RARITY[p.rarity] }}
            />
            <span className="bg-black/80 px-1 font-mono text-[8px] text-white/70">
              {String(i + 1).padStart(3, "0")}
            </span>
          </div>
        )}
      />
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_3px,rgba(77,255,42,0.035)_3px_4px)]" />

      {/* top readout */}
      <div className="relative z-10 mx-3 mt-1 flex items-center justify-between border border-[#4dff2a]/30 bg-black/80 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.14em] text-white/70 uppercase">
        <span className="flex items-center gap-1.5 text-[#4dff2a]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#4dff2a]" />
          Live · Sector 07
        </span>
        <span>Sig 05</span>
      </div>

      {/* you, centred */}
      <div className="absolute top-[52%] left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#4dff2a]/25" />
        <Crosshair className="size-7 text-[#4dff2a]" strokeWidth={1.5} />
      </div>

      {/* target panel */}
      <div className="relative z-10 mx-3 mt-auto mb-3 bg-black/85 p-3">
        <Corners />
        <div className="flex gap-3">
          <Art art={target.art} className="size-14 shrink-0" />
          <div className="min-w-0 flex-1 font-mono text-[9.5px] leading-[1.6] tracking-[0.08em] text-white/60 uppercase">
            <p className="text-[#4dff2a]">Target 001 · Locked</p>
            <p className="font-display text-[19px] leading-tight tracking-normal text-white normal-case">
              {target.name}
            </p>
            <p>
              {target.distance} N · <span style={{ color: RARITY[target.rarity] }}>{target.rarity}</span>
            </p>
          </div>
        </div>
        <div className="mt-2.5 h-1 bg-white/10">
          <div className="h-full w-[70%] bg-[#4dff2a]" />
        </div>
      </div>
      <CommandBar active="map" />
    </Phone>
  );
}

function CollectionScreen() {
  return (
    <Phone label="A · Collection" className="bg-[#050605]">
      <div className="relative z-10 px-4 pt-2">
        <p className="font-mono text-[9px] tracking-[0.18em] text-[#4dff2a] uppercase">
          ▸ Inventory / 06 items / 05 artists
        </p>
        <h3 className="font-display mt-1 text-[34px] leading-none text-white">COLLECTION</h3>
        <div className="mt-3 flex border-b border-white/10 font-mono text-[10px] tracking-[0.14em] uppercase">
          {["Drops", "Posts", "Murals"].map((t, i) => (
            <span
              key={t}
              className={cn(
                "-mb-px border-b-2 px-3 pb-2",
                i === 0 ? "border-[#4dff2a] text-white" : "border-transparent text-white/40",
              )}
            >
              {t}
            </span>
          ))}
          <span className="ml-auto pb-2 text-white/40">Sort ▾</span>
        </div>
      </div>
      <div className="relative z-10 flex-1 overflow-hidden px-4">
        {ITEMS.map((it) => (
          <div key={it.id} className="flex items-center gap-3 border-b border-white/[0.07] py-2.5">
            <div className="relative p-1">
              <Corners color={RARITY[it.rarity]} size={6} />
              <Art art={it.art} className="size-10" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] tracking-[0.14em] text-white/40">#{it.id}</p>
              <p className="truncate text-[13.5px] font-semibold text-white">{it.name}</p>
              <p className="truncate text-[11px] text-white/45">{it.artist}</p>
            </div>
            <span
              className="border px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] uppercase"
              style={{ color: RARITY[it.rarity], borderColor: `${RARITY[it.rarity]}66` }}
            >
              {it.rarity}
            </span>
          </div>
        ))}
      </div>
      <CommandBar active="coll" />
    </Phone>
  );
}

export function FieldOps() {
  return (
    <>
      <MapScreen />
      <CollectionScreen />
    </>
  );
}
