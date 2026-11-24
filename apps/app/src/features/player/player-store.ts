"use client";

import { create } from "zustand";

export type QueueTrack = {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  coverUrl: string;
  /** Shown on the player's Buy button when the list the song came from knows it */
  price?: { actionToken: string; usd: string } | null;
};

type PlayerState = {
  queue: QueueTrack[];
  index: number;
  playing: boolean;
  /** The full-screen player (phones) is open */
  fullOpen: boolean;
  setFullOpen: (open: boolean) => void;
  /** Stop and remove the player: clears the queue, so the bar and the right panel go away */
  dismiss: () => void;
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
  fullOpen: false,
  setFullOpen: (fullOpen) => set({ fullOpen }),
  dismiss: () => set({ queue: [], index: 0, playing: false, fullOpen: false }),
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

/**
 * How far through the current song the bar is, 0–1, for small displays elsewhere (the
 * notch). Its own store, so the many timeupdates don't re-render the player's subscribers.
 */
export const usePlayerProgress = create<{ value: number; current: number; duration: number }>(
  () => ({ value: 0, current: 0, duration: 0 }),
);
export const setPlayerProgress = (current: number, duration: number) =>
  usePlayerProgress.setState({
    current,
    duration,
    value: duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0,
  });
