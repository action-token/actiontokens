"use client";

import { BOOT_CONCEPTS, useBootClock } from "~/components/boot/concepts";

function Looping({ C }: { C: (typeof BOOT_CONCEPTS)[number]["C"] }) {
  const t = useBootClock(true);
  return <C t={t} />;
}

export function BootReview() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#030403] text-white">
      <header className="mx-auto max-w-[1280px] px-6 pt-12 pb-6">
        <p className="font-mono text-[11px] tracking-[0.2em] text-[#4dff2a] uppercase">
          ActionTokens AR · Boot review
        </p>
        <h1 className="font-display mt-2 text-[34px] leading-none">Pick the boot screen</h1>
        <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-white/60">
          Four new layouts, each looping. Reply with a number.
        </p>
      </header>
      <main className="mx-auto flex max-w-[1280px] flex-wrap gap-8 px-6 pb-24">
        {BOOT_CONCEPTS.map(({ id, name, idea, C }) => (
          <section key={id} className="flex w-[290px] flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#4dff2a] text-[18px] text-black">
                {id}
              </span>
              <div>
                <h2 className="text-[15px] font-semibold">{name}</h2>
                <p className="text-[12.5px] leading-snug text-white/55">{idea}</p>
              </div>
            </div>
            <div style={{ height: 580, width: 290 }} className="relative shrink-0 overflow-hidden rounded-[34px] border-[6px] border-[#1a1f1a] bg-[#0b0f0b]">
              {/* Under the boot: a stand-in for the map it reveals. */}
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#0e1a10,#132415_40%,#0b120c)]">
                <div className="absolute inset-0 bg-[linear-gradient(transparent_47%,rgba(77,255,42,0.25)_48%,rgba(77,255,42,0.25)_52%,transparent_53%)] [background-size:60px_60px]" />
              </div>
              <Looping C={C} />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
