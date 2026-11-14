"use client";

import { Play } from "lucide-react";

import { usePlayer } from "../player/player-store";
import { RightLabel } from "./right-frame";

/** How many songs are left in the queue after the current one. */
export const useQueueAhead = () =>
  usePlayer((state) => Math.max(0, state.queue.length - state.index - 1));

/** The next few songs in the queue; tap one to play it. Used by the right panel and the phone player. */
export function UpNextList({ limit = 4 }: { limit?: number }) {
  const { queue, index, playQueue } = usePlayer();
  const upNext = queue.slice(index + 1, index + 1 + limit);
  if (upNext.length === 0) return null;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <RightLabel note={`${queue.length - index - 1} in queue`}>up next</RightLabel>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
        {upNext.map((entry, offset) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => playQueue(queue, index + 1 + offset)}
              className="group hover:bg-fg/10 focus-visible:bg-fg/10 grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-1.5 text-left transition-colors"
            >
              <span className="relative block size-11 overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                <img src={entry.coverUrl} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Play className="size-4 fill-white text-white" aria-hidden />
                </span>
              </span>
              <span className="min-w-0">
                <b className="block truncate text-sm font-bold">{entry.title}</b>
                <span className="text-fg-muted block truncate text-[12px]">{entry.artistName}</span>
              </span>
              {offset === 0 && (
                <span className="bg-surface-2 text-fg-muted rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase">
                  Next
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
