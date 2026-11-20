"use client";

import type { Dispatch, SetStateAction } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import { clampPan, clampVolume, defaultSetting, type Mix, toggle } from "~/lib/stems/mix";

export type StemInfo = { id: string; name: string; color: string };

/**
 * One mixer strip per stem: its colour and name, mute and solo, volume and
 * pan. `compact` is the player's version: one line per stem, volume only.
 */
export function StemRows({
  stems,
  mix,
  setMix,
  compact,
}: {
  stems: StemInfo[];
  mix: Mix;
  setMix: Dispatch<SetStateAction<Mix>>;
  compact?: boolean;
}) {
  if (compact) return <CompactRows stems={stems} mix={mix} setMix={setMix} />;
  const update = (id: string, change: Partial<Mix[string]>) =>
    setMix((current) => ({
      ...current,
      [id]: { ...(current[id] ?? defaultSetting()), ...change },
    }));
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
              compact
                ? "grid-cols-[minmax(0,1fr)_auto]"
                : "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[10rem_auto_minmax(0,1fr)_minmax(0,9rem)]",
              !heard && "opacity-50",
            )}
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ background: stem.color }}
              />
              <span className="truncate">{stem.name}</span>
            </span>
            <span className="flex gap-1">
              <StemToggle
                label="Mute"
                short="M"
                on={setting.mute}
                tone="danger"
                onClick={() => setMix((current) => toggle(current, stem.id, "mute"))}
              />
              <StemToggle
                label="Solo"
                short="S"
                on={setting.solo}
                tone="primary"
                onClick={() => setMix((current) => toggle(current, stem.id, "solo"))}
              />
            </span>
            <label
              className={cn(
                "text-fg-muted flex items-center gap-2 text-xs",
                compact ? "col-span-2" : "col-span-2 sm:col-span-1",
              )}
            >
              Volume
              <input
                type="range"
                aria-label={`${stem.name} volume`}
                min={0}
                max={1}
                step={0.01}
                value={setting.volume}
                onChange={(event) =>
                  update(stem.id, { volume: clampVolume(Number(event.target.value)) })
                }
                className="accent-fg h-1 min-w-0 flex-1 cursor-pointer"
              />
              <span className="num w-8 text-right">{Math.round(setting.volume * 100)}</span>
            </label>
            <label
              className={cn(
                "text-fg-muted flex items-center gap-2 text-xs",
                compact ? "col-span-2" : "col-span-2 sm:col-span-1",
              )}
            >
              Pan
              <input
                type="range"
                aria-label={`${stem.name} pan`}
                min={-1}
                max={1}
                step={0.05}
                value={setting.pan}
                onChange={(event) => update(stem.id, { pan: clampPan(Number(event.target.value)) })}
                onDoubleClick={() => update(stem.id, { pan: 0 })}
                className="accent-fg h-1 min-w-0 flex-1 cursor-pointer"
              />
              <span className="num w-6 text-right">
                {setting.pan === 0 ? "C" : setting.pan < 0 ? "L" : "R"}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function StemToggle({
  label,
  short,
  on,
  tone,
  onClick,
}: {
  label: string;
  short: string;
  on: boolean;
  tone: "danger" | "primary";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md border-2 text-xs font-extrabold transition-colors",
        on
          ? tone === "danger"
            ? "bg-danger border-danger text-white"
            : "bg-primary text-primary-foreground border-fg"
          : "border-border-strong text-fg-muted hover:bg-surface-3",
      )}
    >
      {short}
    </button>
  );
}

/**
 * The player's mixer: one line per stem. The coloured bar is the volume (drag
 * it); M silences the stem, S plays only that stem. A silenced stem dims and
 * its name is struck through, so it is clear what you are hearing.
 */
function CompactRows({
  stems,
  mix,
  setMix,
}: {
  stems: StemInfo[];
  mix: Mix;
  setMix: Dispatch<SetStateAction<Mix>>;
}) {
  const anySolo = Object.values(mix).some((entry) => entry.solo);
  return (
    <ul className="grid gap-1.5">
      {stems.map((stem) => {
        const setting = mix[stem.id] ?? defaultSetting();
        const heard = !setting.mute && (!anySolo || setting.solo);
        return (
          <li
            key={stem.id}
            className="bg-surface-2 grid grid-cols-[5.25rem_auto_minmax(0,1fr)_1.75rem] items-center gap-2 rounded-xl px-2.5 py-2"
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-sm font-bold",
                !heard && "text-fg-faint line-through",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-full", !heard && "opacity-40")}
                style={{ background: stem.color }}
              />
              <span className="truncate">{stem.name}</span>
            </span>
            <span className="flex gap-1">
              <StemToggle
                label={`Mute ${stem.name}`}
                short="M"
                on={setting.mute}
                tone="danger"
                onClick={() => setMix((current) => toggle(current, stem.id, "mute"))}
              />
              <StemToggle
                label={`Solo ${stem.name}`}
                short="S"
                on={setting.solo}
                tone="primary"
                onClick={() => setMix((current) => toggle(current, stem.id, "solo"))}
              />
            </span>
            <input
              type="range"
              aria-label={`${stem.name} volume`}
              min={0}
              max={1}
              step={0.01}
              value={setting.volume}
              onChange={(event) =>
                setMix((current) => ({
                  ...current,
                  [stem.id]: {
                    ...(current[stem.id] ?? defaultSetting()),
                    volume: clampVolume(Number(event.target.value)),
                  },
                }))
              }
              style={{ accentColor: stem.color }}
              className={cn("h-2 min-w-0 cursor-pointer", !heard && "opacity-40")}
            />
            <span className="num text-fg-muted text-right text-xs">
              {Math.round(setting.volume * 100)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
