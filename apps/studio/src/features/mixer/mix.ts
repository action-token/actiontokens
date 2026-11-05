/**
 * The mixer's model, kept apart from audio so it can be tested. A project is
 * tracks (name, colour, volume, pan, mute, solo), each holding clips: a piece
 * of an audio file placed on the timeline (where it starts, how much of the
 * file is trimmed off each end, its fades). Times are seconds.
 */
export type MixClip = {
  id: string;
  url: string;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  /** The file's full length */
  duration: number;
  fadeIn: number;
  fadeOut: number;
};
export type MixTrack = {
  id: string;
  name: string;
  color: string;
  volume: number;
  /** -1 (left) to 1 (right) */
  pan: number;
  muted: boolean;
  soloed: boolean;
  clips: MixClip[];
};
export type MixPublish = {
  audio: { url: string; durationSec: number };
  stems: { name: string; url: string; durationSec: number }[];
};
export type MixProject = {
  version: 2;
  bpm: number;
  masterVolume: number;
  /** Moves and trims land on beats */
  snap: boolean;
  tracks: MixTrack[];
  publish?: MixPublish | null;
};

export const MAX_TRACKS = 24;
export const MAX_CLIPS = 64;
/** The shortest a clip may be. */
export const MIN_CLIP = 0.25;
export const TRACK_COLORS = ["#dbdc2c", "#5ec8f2", "#f2865e", "#a98bf5", "#62d6a0", "#f25e9c"];

export const emptyProject = (): MixProject => ({
  version: 2,
  bpm: 120,
  masterVolume: 0.9,
  snap: true,
  tracks: [],
});

/** How long a clip plays: its file minus the trimmed ends. */
export const clipLength = (clip: MixClip) =>
  Math.max(0, clip.duration - clip.trimStart - clip.trimEnd);

export const clipEnd = (clip: MixClip) => clip.startTime + clipLength(clip);

/** Where the mix ends: the last clip's end. */
export const mixLength = (tracks: MixTrack[]) =>
  Math.max(0, ...tracks.flatMap((track) => track.clips.map(clipEnd)));

/** Which tracks you hear: soloed ones if any are, otherwise every unmuted one. */
export function audible(tracks: MixTrack[]) {
  const solo = tracks.some((track) => track.soloed && !track.muted);
  return tracks.filter((track) => !track.muted && (!solo || track.soloed));
}

/**
 * What to play of a clip from `from` on the timeline: when to start (seconds
 * from now), where in the file, and for how long. Null when it's already over.
 */
export function playSlice(clip: MixClip, from: number) {
  const length = clipLength(clip);
  if (from >= clip.startTime + length) return null;
  const into = Math.max(0, from - clip.startTime);
  return {
    wait: Math.max(0, clip.startTime - from),
    offset: clip.trimStart + into,
    length: length - into,
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The clip's volume (0 to 1) at a point on the timeline, from its fades. */
function fadeGainAt(clip: MixClip, at: number) {
  const into = at - clip.startTime;
  const left = clipEnd(clip) - at;
  let gain = 1;
  if (clip.fadeIn > 0 && into < clip.fadeIn) gain = Math.min(gain, Math.max(0, into / clip.fadeIn));
  if (clip.fadeOut > 0 && left < clip.fadeOut)
    gain = Math.min(gain, Math.max(0, left / clip.fadeOut));
  return gain;
}

/**
 * The fades as volume points to ramp between, playing from `from`: `at` is
 * seconds from now. Empty when the clip has no fades (it plays at full volume).
 */
export function fadePoints(clip: MixClip, from: number) {
  if (clip.fadeIn <= 0 && clip.fadeOut <= 0) return [];
  const start = clip.startTime;
  const end = clipEnd(clip);
  const marks: number[] = [];
  if (clip.fadeIn > 0) marks.push(start, start + clip.fadeIn);
  if (clip.fadeOut > 0) marks.push(end - clip.fadeOut, end);
  const points: { at: number; gain: number }[] = [];
  if (from > start) points.push({ at: 0, gain: round(fadeGainAt(clip, from)) });
  for (const mark of marks) {
    if (mark < from) continue;
    const at = round(mark - from);
    if (points.some((point) => point.at === at)) continue;
    points.push({ at, gain: round(fadeGainAt(clip, mark)) });
  }
  return points;
}

let counter = 0;
const newId = (prefix: string) => {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
};

export const newClip = (input: { url: string; duration: number }, startTime = 0): MixClip => ({
  id: newId("c"),
  url: input.url,
  startTime,
  trimStart: 0,
  trimEnd: 0,
  duration: input.duration,
  fadeIn: 0,
  fadeOut: 0,
});

export function newTrack(
  input: { name: string; url: string; duration: number },
  index: number,
  startTime = 0,
): MixTrack {
  return {
    id: newId("t"),
    name: input.name.slice(0, 80) || "Track",
    color: TRACK_COLORS[index % TRACK_COLORS.length]!,
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    clips: [newClip(input, startTime)],
  };
}

/** Fades shrunk, if needed, so together they fit in the clip. */
function fitFades(clip: MixClip): MixClip {
  const length = clipLength(clip);
  const fadeIn = Math.min(clip.fadeIn, length);
  return { ...clip, fadeIn, fadeOut: Math.min(clip.fadeOut, length - fadeIn) };
}

/** Moves a clip, never before 0. */
export const moveTo = (clip: MixClip, startTime: number): MixClip => ({
  ...clip,
  startTime: Math.max(0, Math.round(startTime * 100) / 100),
});

/**
 * Trims a clip from its left or right edge by `delta` seconds of the file.
 * The left edge moves the clip with it, so what's left stays where it was.
 */
export function trim(clip: MixClip, edge: "start" | "end", delta: number): MixClip {
  const room = clipLength(clip) - MIN_CLIP;
  if (edge === "start") {
    const next = Math.min(Math.max(-clip.trimStart, delta), room);
    const moved = Math.max(-clip.startTime, next);
    return fitFades({
      ...clip,
      trimStart: clip.trimStart + moved,
      startTime: clip.startTime + moved,
    });
  }
  const next = Math.min(Math.max(-clip.trimEnd, -delta), room);
  return fitFades({ ...clip, trimEnd: clip.trimEnd + next });
}

/**
 * Cuts a clip in two at `at` on the timeline. Null when `at` isn't inside it,
 * or either side would be shorter than a quarter second. The left part keeps
 * the fade in, the right part the fade out.
 */
export function splitClip(clip: MixClip, at: number): [MixClip, MixClip] | null {
  const into = at - clip.startTime;
  if (into < MIN_CLIP || clipEnd(clip) - at < MIN_CLIP) return null;
  const left = fitFades({ ...clip, trimEnd: clip.trimEnd + (clipLength(clip) - into), fadeOut: 0 });
  const right = fitFades({
    ...clip,
    id: newId("c"),
    startTime: at,
    trimStart: clip.trimStart + into,
    fadeIn: 0,
  });
  return [left, right];
}

/** A copy of the clip placed right after it. */
export const duplicateClip = (clip: MixClip): MixClip => ({
  ...clip,
  id: newId("c"),
  startTime: clipEnd(clip),
});

/** A time moved to the nearest beat at `bpm` when snapping is on (never before 0). */
export function snapTime(seconds: number, bpm: number, on: boolean) {
  const safe = Math.max(0, seconds);
  if (!on) return safe;
  const beat = 60 / bpm;
  return round(Math.round(safe / beat) * beat);
}

/** Sets a fade's length, kept within the clip and clear of the other fade. */
export function setFade(clip: MixClip, edge: "in" | "out", seconds: number): MixClip {
  const other = edge === "in" ? clip.fadeOut : clip.fadeIn;
  const value = round(Math.min(Math.max(0, seconds), clipLength(clip) - other));
  return edge === "in" ? { ...clip, fadeIn: value } : { ...clip, fadeOut: value };
}

type V1Track = {
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

/**
 * A saved project in today's shape. Projects saved before tracks held several
 * clips (one clip per track) open as tracks with that one clip.
 */
export function normalizeProject(data: unknown): MixProject {
  const raw = (data ?? {}) as Partial<MixProject> & { tracks?: unknown[] };
  if (raw.version === 2) return raw as MixProject;
  const base = emptyProject();
  return {
    ...base,
    bpm: typeof raw.bpm === "number" ? raw.bpm : base.bpm,
    masterVolume: typeof raw.masterVolume === "number" ? raw.masterVolume : base.masterVolume,
    ...(raw.publish !== undefined && { publish: raw.publish }),
    tracks: ((raw.tracks ?? []) as V1Track[]).map((track) => ({
      id: track.id,
      name: track.name,
      color: track.color,
      volume: track.volume,
      pan: 0,
      muted: track.muted,
      soloed: track.soloed,
      clips: [
        {
          id: `${track.id}-1`,
          url: track.url,
          startTime: track.startTime,
          trimStart: track.trimStart,
          trimEnd: track.trimEnd,
          duration: track.duration,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    })),
  };
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
