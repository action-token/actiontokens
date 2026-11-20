import { Layers, LayoutGrid, LocateFixed, Music2, Search, ShoppingBag } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

import { Art, FakeMap, ITEMS, Phone, RARITY } from "./kit";

/**
 * C — Map-first sheets: the map is the app. No tab bar: collection, market and artists
 * slide up as sheets over the live map, and a floating cluster (with AR in the middle)
 * replaces the navigation.
 */

const glass = "bg-[#0e120e]/85 backdrop-blur-xl border border-white/[0.08]";

function Cluster({ active }: { active?: "coll" }) {
  const btn = "flex size-11 items-center justify-center rounded-full";
  return (
    <div className="absolute inset-x-0 bottom-4 z-30 flex items-center justify-center gap-3">
      <span className={cn(btn, glass, active === "coll" ? "text-[#4dff2a]" : "text-white/80")}>
        <LayoutGrid className="size-[18px]" />
      </span>
      <span className={cn(btn, glass, "text-white/80")}>
        <ShoppingBag className="size-[18px]" />
      </span>
      <span className="flex size-16 items-center justify-center rounded-full bg-[#4dff2a] text-[15px] font-black tracking-tight text-black shadow-[0_0_0_6px_rgba(77,255,42,0.15),0_0_30px_rgba(77,255,42,0.5)]">
        AR
      </span>
      <span className={cn(btn, glass, "text-white/80")}>
        <Music2 className="size-[18px]" />
      </span>
      <span className="flex size-11 items-center justify-center overflow-hidden rounded-full border-2 border-[#4dff2a] bg-[#1a221a] text-[12px] font-bold text-[#4dff2a]">
        GD
      </span>
    </div>
  );
}

function Pin({ rarity }: { rarity: keyof typeof RARITY }) {
  return (
    <span className="relative flex size-9 items-center justify-center">
      <span className="absolute inset-0 animate-ping rounded-full opacity-30" style={{ background: RARITY[rarity] }} />
      <span
        className="size-4 rounded-full border-2 border-black"
        style={{ background: RARITY[rarity], boxShadow: `0 0 14px ${RARITY[rarity]}` }}
      />
    </span>
  );
}

function MapScreen() {
  return (
    <Phone label="C · Map (home)" className="bg-black" statusBar>
      <FakeMap tone="ink" className="top-0" pin={(p) => <Pin rarity={p.rarity} />} />
      <div className="relative z-20 mx-3 mt-1 flex items-center gap-2">
        <div className={cn(glass, "flex h-11 flex-1 items-center gap-2 rounded-full px-4 text-[13px] text-white/45")}>
          <Search className="size-4" />
          Search drops, artists
        </div>
      </div>
      <div className="absolute top-[110px] right-3 z-20 flex flex-col gap-2">
        <span className={cn(glass, "flex size-10 items-center justify-center rounded-full text-white/80")}>
          <LocateFixed className="size-[18px]" />
        </span>
        <span className={cn(glass, "flex size-10 items-center justify-center rounded-full text-white/80")}>
          <Layers className="size-[18px]" />
        </span>
      </div>

      {/* peeking sheet */}
      <div className={cn(glass, "absolute inset-x-0 bottom-0 z-20 h-[250px] rounded-t-[28px] pt-2")}>
        <span className="mx-auto block h-1 w-10 rounded-full bg-white/25" />
        <div className="mt-3 flex items-baseline justify-between px-5">
          <p className="text-[17px] font-bold text-white">Nearby</p>
          <p className="text-[12px] text-white/45">5 drops · 4 km</p>
        </div>
        <div className="mt-3 flex gap-2.5 overflow-hidden pl-5">
          {ITEMS.slice(0, 3).map((it) => (
            <div key={it.id} className="w-[120px] shrink-0 overflow-hidden rounded-[16px] bg-white/[0.05]">
              <Art art={it.art} className="h-[70px]" />
              <div className="p-2">
                <p className="truncate text-[12px] font-semibold text-white">{it.name}</p>
                <p className="text-[10.5px] text-white/45">{it.distance}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Cluster />
    </Phone>
  );
}

function CollectionScreen() {
  return (
    <Phone label="C · Collection sheet" className="bg-black">
      <FakeMap tone="ink" className="opacity-50" pin={(p) => <Pin rarity={p.rarity} />} />
      <div className={cn(glass, "absolute inset-x-0 top-[96px] bottom-0 z-20 rounded-t-[28px] pt-2")}>
        <span className="mx-auto block h-1 w-10 rounded-full bg-white/25" />
        <div className="mt-3 flex items-center justify-between px-5">
          <p className="text-[22px] font-bold text-white">Collection</p>
          <span className="rounded-full bg-white/[0.07] px-3 py-1 text-[11px] text-white/60">Newest</span>
        </div>
        <div className="mx-5 mt-3 grid grid-cols-3 rounded-full bg-white/[0.06] p-1 text-center text-[12px] font-semibold">
          {["Drops", "Posts", "Murals"].map((t, i) => (
            <span
              key={t}
              className={cn("rounded-full py-1.5", i === 0 ? "bg-[#4dff2a] text-black" : "text-white/55")}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 px-5">
          {ITEMS.map((it) => (
            <div key={it.id} className="relative overflow-hidden rounded-[14px]">
              <Art art={it.art} className="aspect-square" />
              <span
                className="absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-black"
                style={{ background: RARITY[it.rarity] }}
              />
              <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 px-1.5 pt-3 pb-1 text-[10px] font-semibold text-white">
                {it.name}
              </p>
            </div>
          ))}
        </div>
      </div>
      <Cluster active="coll" />
    </Phone>
  );
}

export function Sheets() {
  return (
    <>
      <MapScreen />
      <CollectionScreen />
    </>
  );
}
