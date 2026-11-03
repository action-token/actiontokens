/**
 * The mixer's model, kept apart from audio so it can be tested: tracks on a
 * timeline (where each starts, how much of its file is trimmed), which tracks
 * are heard (solo wins over everything; mute silences), and the timeline's
 * scale. Times are seconds.
 */
export type MixTrack = {
  id: string;
  name: string;
  url: string;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  duration: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
  color: string;
};
export type MixProject = { bpm: number; masterVolume: number; tracks: MixTrack[] };

export const MAX_TRACKS = 24;
/** The shortest a clip may be trimmed to. */
export const MIN_CLIP = 0.25;
export const TRACK_COLORS = ["#dbdc2c", "#5ec8f2", "#f2865e", "#a98bf5", "#62d6a0", "#f25e9c"];

export const emptyProject = (): MixProject => ({ bpm: 120, masterVolume: 0.9, tracks: [] });

/** How long a track plays: its file minus the trimmed ends. */
export const clipLength = (track: MixTrack) =>
  Math.max(0, track.duration - track.trimStart - track.trimEnd);

export const clipEnd = (track: MixTrack) => track.startTime + clipLength(track);

/** Where the mix ends: the last clip's end. */
export const mixLength = (tracks: MixTrack[]) => Math.max(0, ...tracks.map(clipEnd));

/** Which tracks you hear: soloed ones if any are, otherwise every unmuted one. */
export function audible(tracks: MixTrack[]) {
  const solo = tracks.some((track) => track.soloed && !track.muted);
  return tracks.filter((track) => !track.muted && (!solo || track.soloed));
}

/**
 * What to play of a track from `from` on the timeline: when to start (seconds
 * from now), where in the file, and for how long. Null when it's already over.
 */
export function playSlice(track: MixTrack, from: number) {
  const length = clipLength(track);
  if (from >= track.startTime + length) return null;
  const into = Math.max(0, from - track.startTime);
  return {
    wait: Math.max(0, track.startTime - from),
    offset: track.trimStart + into,
    length: length - into,
  };
}

let counter = 0;
export function newTrack(
  input: { name: string; url: string; duration: number },
  index: number,
  startTime = 0,
): MixTrack {
  counter += 1;
  return {
    id: `t${Date.now().toString(36)}${counter}`,
    name: input.name.slice(0, 80) || "Track",
    url: input.url,
    startTime,
    trimStart: 0,
    trimEnd: 0,
    duration: input.duration,
    volume: 1,
    muted: false,
    soloed: false,
    color: TRACK_COLORS[index % TRACK_COLORS.length]!,
  };
}

/** Moves a clip, never before 0. */
export const moveTo = (track: MixTrack, startTime: number): MixTrack => ({
  ...track,
  startTime: Math.max(0, Math.round(startTime * 100) / 100),
});

/**
 * Trims a clip from its left or right edge by `delta` seconds of the file.
 * The left edge moves the clip with it, so what's left stays where it was.
 */
export function trim(track: MixTrack, edge: "start" | "end", delta: number): MixTrack {
  const room = clipLength(track) - MIN_CLIP;
  if (edge === "start") {
    const next = Math.min(Math.max(-track.trimStart, delta), room);
    const moved = Math.max(-track.startTime, next);
    return { ...track, trimStart: track.trimStart + moved, startTime: track.startTime + moved };
  }
  const next = Math.min(Math.max(-track.trimEnd, -delta), room);
  return { ...track, trimEnd: track.trimEnd + next };
}

/** "1:05.3" */
export function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** Pixels per second at a zoom level (1 = 40 px a second). */
export const pxPerSecond = (zoom: number) => 40 * zoom;
