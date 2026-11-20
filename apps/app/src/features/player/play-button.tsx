"use client";

import { Pause, Play } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

import { currentTrack, type QueueTrack, usePlayer } from "./player-store";

/** A round Play/Pause for one track, e.g. on the item page cover. */
export function PlayButton({ track, className }: { track: QueueTrack; className?: string }) {
  const { playQueue, toggle } = usePlayer();
  const isCurrent = usePlayer((state) => currentTrack(state)?.id === track.id);
  const playing = usePlayer((state) => state.playing) && isCurrent;

  return (
    <button
      type="button"
      aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
      onClick={() => (isCurrent ? toggle() : playQueue([track]))}
      className={cn(
        "bg-primary text-primary-foreground grid size-14 place-items-center rounded-full shadow-lg transition-transform hover:scale-105",
        className,
      )}
    >
      {playing ? (
        <Pause className="size-6 fill-current" />
      ) : (
        <Play className="size-6 translate-x-px fill-current" />
      )}
    </button>
  );
}
