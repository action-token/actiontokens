import { ArrowUpRight, ScanLine } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

import { Art, FakeMap, ITEMS, Phone, RARITY } from "./kit";

/**
 * D — Ticket pass: navigation is a row of big text tabs across the top, the map sits in a
 * rounded inset window, every collectible is a ticket with a tear-off stub, and AR is a
 * floating pill in the corner.
 */

function TopTabs({ active }: { active: number }) {
  return (
    <div className="relative z-10 flex items-end gap-4 overflow-hidden px-5 pt-1 pb-3">
      {["Map", "Collection", "Market", "Artists"].map((t, i) => (
        <span
          key={t}
          className={cn(
            "font-display relative shrink-0 leading-none",
            i === active ? "text-[30px] text-white" : "text-[17px] text-white/30",
          )}
        >
          {t}
          {i === active && <span className="absolute -bottom-1.5 left-0 h-[3px] w-6 rounded-full bg-[#4dff2a]" />}
        </span>
      ))}
    </div>
  );
}

function ArPill() {
  return (
    <div className="absolute right-4 bottom-5 z-20 flex items-center gap-2 rounded-full bg-[#4dff2a] py-3 pr-5 pl-4 text-[13px] font-bold text-black shadow-[0_12px_30px_-8px_rgba(77,255,42,0.7)]">
      <ScanLine className="size-[18px]" strokeWidth={2.4} />
      Open AR
    </div>
  );
}

/** A ticket: art + info on the left, a perforated tear-off stub on the right. */
function Ticket({ item, compact = false }: { item: (typeof ITEMS)[number]; compact?: boolean }) {
  const notch = "absolute size-4 rounded-full bg-[#050605]";
  return (
    <div className="relative flex overflow-hidden rounded-[18px] bg-[#121712]">
      <div className={cn("flex flex-1 items-center gap-3 p-3", compact && "py-2.5")}>
        <Art art={item.art} className={cn("shrink-0 rounded-[12px]", compact ? "size-12" : "size-16")} />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-white/40 uppercase">{item.artist}</p>
          <p className={cn("font-display truncate leading-tight text-white", compact ? "text-[18px]" : "text-[22px]")}>
            {item.name}
          </p>
          <p className="text-[11px] text-white/50">{item.distance} away</p>
        </div>
      </div>
      {/* perforation */}
      <div className="relative w-0 border-l-2 border-dashed border-white/15">
        <span className={cn(notch, "-top-2 -left-[9px]")} />
        <span className={cn(notch, "-bottom-2 -left-[9px]")} />
      </div>
      <div
        className="flex w-11 flex-col items-center justify-center gap-1"
        style={{ background: `${RARITY[item.rarity]}1f` }}
      >
        <span
          className="text-[9px] font-black tracking-[0.2em] uppercase [writing-mode:vertical-rl]"
          style={{ color: RARITY[item.rarity] }}
        >
          {item.rarity}
        </span>
      </div>
    </div>
  );
}

function MapScreen() {
  return (
    <Phone label="D · Map" className="bg-[#050605]">
      <TopTabs active={0} />
      <div className="relative z-10 mx-3 h-[300px] overflow-hidden rounded-[28px] border border-white/[0.08]">
        <FakeMap
          pin={(p) => (
            <span className="flex flex-col items-center">
              <span
                className="size-5 rounded-full border-[3px] border-[#050605]"
                style={{ background: RARITY[p.rarity], boxShadow: `0 0 0 2px ${RARITY[p.rarity]}55` }}
              />
            </span>
          )}
        />
        <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white">
          5 drops near you
        </span>
      </div>
      <div className="relative z-10 mt-4 px-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[12px] font-semibold text-white/60">Closest drop</p>
          <ArrowUpRight className="size-4 text-white/40" />
        </div>
        <Ticket item={ITEMS[0]!} />
      </div>
      <ArPill />
    </Phone>
  );
}

function CollectionScreen() {
  return (
    <Phone label="D · Collection" className="bg-[#050605]">
      <TopTabs active={1} />
      <div className="relative z-10 flex gap-2 px-5">
        {[
          ["6", "items"],
          ["5", "artists"],
          ["1", "legendary"],
        ].map(([n, l]) => (
          <div key={l} className="flex-1 rounded-[14px] bg-[#121712] px-3 py-2">
            <p className="font-display text-[22px] leading-none text-[#4dff2a]">{n}</p>
            <p className="mt-0.5 text-[10px] text-white/45">{l}</p>
          </div>
        ))}
      </div>
      <div className="relative z-10 mt-3 flex flex-col gap-2 px-3">
        {ITEMS.slice(0, 5).map((it) => (
          <Ticket key={it.id} item={it} compact />
        ))}
      </div>
      <ArPill />
    </Phone>
  );
}

export function TicketPass() {
  return (
    <>
      <MapScreen />
      <CollectionScreen />
    </>
  );
}
