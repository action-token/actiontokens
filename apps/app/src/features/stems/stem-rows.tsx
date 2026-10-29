"use client";

import type { Dispatch, SetStateAction } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { clampPan, clampVolume, defaultSetting, type Mix, toggle } from "~/lib/stems/mix";

export type StemInfo = { id: string; name: string; color: string };

/**
 * One mixer strip per stem: its colour and name, mute and solo, volume and
 * pan. `compact` stacks the two sliders under the name, for a small popover.
 */
export function StemRows({ stems, mix, setMix, compact }: { stems: StemInfo[]; mix: Mix; setMix: Dispatch<SetStateAction<Mix>>; compact?: boolean }) {
  const update = (id: string, change: Partial<Mix[string]>) =>
    setMix((current) => ({ ...current, [id]: { ...(current[id] ?? defaultSetting()), ...change } }));
  const anySolo = Object.values(mix).some((entry) => entry.solo);

  return (
    <ul className="grid gap-2">
      {stems.map((stem) => {
        const setting = mix[stem.id] ?? defaultSetting();
        const heard = !setting.mute && (!anySolo || setting.solo);
        return (
          <li
            key={stem.id}
            className={cn(
              "grid items-center gap-x-4 gap-y-2 rounded-xl border p-3 transition-opacity",
              compact ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[10rem_auto_minmax(0,1fr)_minmax(0,9rem)]",
              !heard && "opacity-50",
            )}
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: stem.color }} />
              <span className="truncate">{stem.name}</span>
            </span>
            <span className="flex gap-1">
              <StemToggle label="Mute" short="M" on={setting.mute} tone="danger" onClick={() => setMix((current) => toggle(current, stem.id, "mute"))} />
              <StemToggle label="Solo" short="S" on={setting.solo} tone="primary" onClick={() => setMix((current) => toggle(current, stem.id, "solo"))} />
            </span>
            <label className={cn("text-fg-muted flex items-center gap-2 text-xs", compact ? "col-span-2" : "col-span-2 sm:col-span-1")}>
              Volume
              <input type="range" aria-label={`${stem.name} volume`} min={0} max={1} step={0.01} value={setting.volume} onChange={(event) => update(stem.id, { volume: clampVolume(Number(event.target.value)) })} className="accent-fg h-1 min-w-0 flex-1 cursor-pointer" />
              <span className="num w-8 text-right">{Math.round(setting.volume * 100)}</span>
            </label>
            <label className={cn("text-fg-muted flex items-center gap-2 text-xs", compact ? "col-span-2" : "col-span-2 sm:col-span-1")}>
              Pan
              <input type="range" aria-label={`${stem.name} pan`} min={-1} max={1} step={0.05} value={setting.pan} onChange={(event) => update(stem.id, { pan: clampPan(Number(event.target.value)) })} onDoubleClick={() => update(stem.id, { pan: 0 })} className="accent-fg h-1 min-w-0 flex-1 cursor-pointer" />
              <span className="num w-6 text-right">{setting.pan === 0 ? "C" : setting.pan < 0 ? "L" : "R"}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function StemToggle({ label, short, on, tone, onClick }: { label: string; short: string; on: boolean; tone: "danger" | "primary"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md border text-xs font-bold transition-colors",
        on ? (tone === "danger" ? "bg-danger border-danger text-white" : "bg-primary text-primary-foreground border-fg") : "text-fg-muted hover:bg-surface-2",
      )}
    >
      {short}
    </button>
  );
}
