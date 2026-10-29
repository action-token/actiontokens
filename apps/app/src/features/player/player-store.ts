"use client";

import { create } from "zustand";

export type QueueTrack = {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  coverUrl: string;
  /** Shown on the player's Buy button when the list the song came from knows it */
  price?: { bandcoin: string; usd: string } | null;
};

type PlayerState = {
  queue: QueueTrack[];
  index: number;
  playing: boolean;
  /** Play `tracks`, starting at `start`. Replaces the queue. */
  playQueue: (tracks: QueueTrack[], start?: number) => void;
  toggle: () => void;
  setPlaying: (playing: boolean) => void;
  next: () => void;
  previous: () => void;
};

/** The one queue the player bar plays from. Any list can start it with `playQueue`. */
export const usePlayer = create<PlayerState>((set) => ({
  queue: [],
  index: 0,
  playing: false,
  playQueue: (tracks, start = 0) =>
    set({ queue: tracks, index: start, playing: tracks.length > 0 }),
  toggle: () => set((state) => ({ playing: state.queue.length > 0 && !state.playing })),
  setPlaying: (playing) => set({ playing }),
  next: () =>
    set((state) =>
      state.index < state.queue.length - 1
        ? { index: state.index + 1, playing: true }
        : { playing: false },
    ),
  previous: () => set((state) => ({ index: Math.max(0, state.index - 1), playing: true })),
}));

export const currentTrack = (state: Pick<PlayerState, "queue" | "index">) =>
  state.queue[state.index] ?? null;
