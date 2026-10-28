"use client";

import { Pause, Play, Shuffle } from "lucide-react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import type { ItemCardData } from "../catalog/item-card";
import { currentTrack, usePlayer } from "../player/player-store";
import { TrackRow } from "./track-row";

/** A numbered list of songs; tapping a row plays from there. */
export function TrackList({ tracks }: { tracks: ItemCardData[] }) {
  return (
    <ol className="grid gap-0.5">
      {tracks.map((track, index) => (
        <TrackRow key={track.id} track={track} position={index} list={tracks} />
      ))}
    </ol>
  );
}

/**
 * The big round Play for a list (album, artist): plays from the top, or
 * pauses/resumes when this list is already playing. Optional shuffle.
 */
export function PlayAllButton({ tracks, shuffle, className }: { tracks: ItemCardData[]; shuffle?: boolean; className?: string }) {
  const { playQueue, toggle } = usePlayer();
  const playingThis = usePlayer((state) => tracks.some((track) => track.id === currentTrack(state)?.id));
  const playing = usePlayer((state) => state.playing) && playingThis;
  const playable = tracks.filter((track) => track.playable);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        disabled={playable.length === 0}
        aria-label={playing ? "Pause" : "Play all"}
        onClick={() => (playingThis ? toggle() : playQueue(playable))}
        className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-full shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
      >
        {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 translate-x-px fill-current" />}
      </button>
      {shuffle && playable.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Shuffle play"
          onClick={() => playQueue([...playable].sort(() => Math.random() - 0.5))}
        >
          <Shuffle />
        </Button>
      )}
    </div>
  );
}
