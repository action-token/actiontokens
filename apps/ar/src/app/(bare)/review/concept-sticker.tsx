import { LayoutGrid, Map as MapIcon, Music2, ShoppingBag } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

import { Art, FakeMap, ITEMS, Phone, RARITY } from "./kit";

/**
 * B — Street sticker: phonk street style. Heavy condensed type, collectibles as tilted
 * stickers with thick outlines, hard offset shadows and tape, a halftone texture, and a
 * floating sticker dock with a big tilted AR sticker in the middle.
 */

const halftone =
  "bg-[radial-gradient(rgba(77,255,42,0.16)_1px,transparent_1.4px)] [background-size:7px_7px]";

function Dock({ active }: { active: "map" | "coll" }) {
  const icon = (on: boolean) =>
    cn(
      "flex size-10 items-center justify-center rounded-full",
      on ? "bg-black text-[#4dff2a]" : "text-black/70",
    );
  return (
    <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div className="flex items-center gap-1 rounded-full border-[3px] border-black bg-[#f2f7f2] px-2 py-1.5 shadow-[4px_4px_0_#4dff2a]">
        <span className={icon(active === "map")}>
          <MapIcon className="size-[18px]" strokeWidth={2.4} />
        </span>
        <span className={icon(active === "coll")}>
          <LayoutGrid className="size-[18px]" strokeWidth={2.4} />
        </span>
        <span className="font-display -my-4 mx-1 flex size-[60px] -rotate-6 items-center justify-center rounded-full border-[3px] border-black bg-[#4dff2a] text-[22px] text-black shadow-[3px_3px_0_#000]">
          AR
        </span>
        <span className={icon(false)}>
          <ShoppingBag className="size-[18px]" strokeWidth={2.4} />
        </span>
        <span className={icon(false)}>
          <Music2 className="size-[18px]" strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

function Tape({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute z-10 h-4 w-12 bg-[#f2f7f2]/70 shadow-[0_1px_0_rgba(0,0,0,0.3)]",
        className,
      )}
    />
  );
}

function MapScreen() {
  const near = ITEMS[0]!;
  return (
    <Phone label="B · Map" className="bg-[#070907]">
      <FakeMap
        pin={(p, i) => (
          <span
            className="block size-8 rounded-full border-[3px] border-[#f2f7f2] shadow-[3px_3px_0_#000]"
            style={{ background: RARITY[p.rarity], transform: `rotate(${(i % 2 ? 1 : -1) * 8}deg)` }}
          />
        )}
      />
      <div className={cn("pointer-events-none absolute inset-0", halftone)} />

      <div className="relative z-10 px-4 pt-2">
        <span className="font-display inline-block -rotate-3 border-[3px] border-black bg-[#4dff2a] px-3 py-1 text-[26px] leading-none text-black shadow-[4px_4px_0_#000]">
          5 DROPS
        </span>
        <span className="font-display ml-2 inline-block rotate-2 bg-black px-2 py-1 text-[18px] leading-none text-[#f2f7f2]">
          NEAR YOU
        </span>
      </div>

      <div className="relative z-10 mx-5 mt-auto mb-[92px] rotate-[-1.5deg] border-[3px] border-black bg-[#f2f7f2] p-2.5 shadow-[5px_5px_0_#4dff2a]">
        <Tape className="-top-2 left-1/2 -translate-x-1/2 rotate-3" />
        <div className="flex items-center gap-3">
          <Art art={near.art} className="size-14 border-2 border-black" />
          <div className="min-w-0 flex-1 text-black">
            <p className="font-display text-[22px] leading-none">{near.name.toUpperCase()}</p>
            <p className="mt-1 text-[11px] font-bold">
              {near.artist} · {near.distance}
            </p>
          </div>
          <span className="font-display rotate-6 bg-black px-2 py-1 text-[13px] text-[#4dff2a]">
            GO →
          </span>
        </div>
      </div>
      <Dock active="map" />
    </Phone>
  );
}

function CollectionScreen() {
  return (
    <Phone label="B · Collection" className="bg-[#070907]">
      <div className={cn("pointer-events-none absolute inset-0 opacity-60", halftone)} />
      <div className="relative z-10 px-4 pt-1">
        <h3 className="font-display text-[54px] leading-[0.85] text-[#f2f7f2]">
          MY
          <br />
          <span className="relative inline-block">
            <span className="absolute inset-x-[-6px] top-[4%] bottom-[-4px] -rotate-1 bg-[#4dff2a]" />
            <span className="relative text-black">STASH</span>
          </span>
        </h3>
        <div className="mt-3 flex gap-2">
          {["ALL", "RARE", "EPIC", "LEGEND"].map((t, i) => (
            <span
              key={t}
              className={cn(
                "font-display border-2 border-black px-2 py-0.5 text-[13px] shadow-[2px_2px_0_#000]",
                i === 0 ? "bg-[#4dff2a] text-black" : "bg-[#f2f7f2] text-black",
              )}
              style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 2}deg)` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="relative z-10 mt-4 grid grid-cols-2 gap-x-3 gap-y-5 px-4">
        {ITEMS.slice(0, 4).map((it, i) => (
          <div
            key={it.id}
            className="relative border-[3px] border-[#f2f7f2] bg-black shadow-[4px_4px_0_#4dff2a]"
            style={{ transform: `rotate(${i % 2 ? 2.5 : -2.5}deg)` }}
          >
            <Tape className={cn("-top-2", i % 2 ? "right-2 rotate-12" : "left-2 -rotate-12")} />
            <Art art={it.art} className="h-24" />
            <div className="px-2 py-1.5">
              <p className="font-display truncate text-[15px] leading-none text-[#f2f7f2]">
                {it.name.toUpperCase()}
              </p>
              <p className="mt-1 text-[9px] font-bold" style={{ color: RARITY[it.rarity] }}>
                ★ {it.rarity.toUpperCase()}
              </p>
            </div>
          </div>
        ))}
      </div>
      <Dock active="coll" />
    </Phone>
  );
}

export function Sticker() {
  return (
    <>
      <MapScreen />
      <CollectionScreen />
    </>
  );
}
