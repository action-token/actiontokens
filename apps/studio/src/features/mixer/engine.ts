"use client";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import {
  audible,
  EQ_BANDS,
  fadePoints,
  FLAT_EQ,
  isFlat,
  type MixEq,
  mixLength,
  type MixTrack,
  playSlice,
} from "./mix";
import { encodeWav } from "./wav";

const EXPORT_RATE = 44_100;

/** The filters of one EQ, by band (a band left out isn't in the chain). */
type EqFilters = Partial<Record<keyof MixEq, BiquadFilterNode>>;

const tune = (filters: EqFilters, eq: MixEq) => {
  for (const band of EQ_BANDS) {
    const filter = filters[band.key];
    if (filter) filter.gain.value = eq[band.key];
  }
};

/**
 * The mixer's sound, on the browser's Web Audio. Files are fetched and decoded
 * once; playing schedules every clip of every audible track at once on one
 * clock, so they stay in time; exporting renders the same schedule offline
 * (faster than real time) into a WAV file.
 */
export class MixEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private stopTimer: () => void = () => undefined;
  private playing: {
    sources: AudioBufferSourceNode[];
    master: GainNode;
    /** The EQ filters now sounding, so a slider can move them while playing */
    eq: { master: EqFilters; tracks: Map<string, EqFilters> };
    startedAt: number;
    from: number;
  } | null = null;

  private audio() {
    this.context ??= new AudioContext();
    return this.context;
  }

  /** The decoded file (fetched once per address). */
  load(url: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) => {
          if (!response.ok)
            throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
              message: "Couldn't load that audio.",
            });
          return response.arrayBuffer();
        })
        .then((bytes) => this.audio().decodeAudioData(bytes));
      // A failed load can be tried again later.
      buffer.catch(() => this.buffers.delete(url));
      this.buffers.set(url, buffer);
    }
    return buffer;
  }

  private loadAll(tracks: MixTrack[]) {
    return Promise.all(tracks.flatMap((track) => track.clips.map((clip) => this.load(clip.url))));
  }

  /**
   * A 3-band EQ in front of `destination`: what to connect into, and its
   * filters. A flat EQ adds nothing (the sound is untouched), unless `live`:
   * while playing, the filters are always there (at 0 dB they change nothing)
   * so a slider can move them without restarting.
   */
  private equalize(
    context: BaseAudioContext,
    eq: MixEq | undefined,
    destination: AudioNode,
    live: boolean,
  ): { input: AudioNode; filters: EqFilters } {
    if (!live && isFlat(eq)) return { input: destination, filters: {} };
    const values = eq ?? FLAT_EQ;
    const filters: EqFilters = {};
    let input = destination;
    // Built back to front, so the sound runs low → mid → high → destination.
    for (const band of [...EQ_BANDS].reverse()) {
      if (!live && values[band.key] === 0) continue;
      const filter = context.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.frequency;
      if (band.q !== null) filter.Q.value = band.q;
      filter.gain.value = values[band.key];
      filter.connect(input);
      filters[band.key] = filter;
      input = filter;
    }
    return { input, filters };
  }

  /**
   * Starts every clip of `tracks` from `from` on the timeline, `at` on the
   * context's clock: each through its fades, then its track's EQ, volume and pan.
   */
  private async schedule(
    context: BaseAudioContext,
    tracks: MixTrack[],
    from: number,
    at: number,
    destination: AudioNode,
    /** Playing (not exporting): each track's filters are kept here, to move while it plays */
    liveEq?: Map<string, EqFilters>,
  ) {
    const sources: AudioBufferSourceNode[] = [];
    for (const track of tracks) {
      const gain = context.createGain();
      gain.gain.value = track.volume;
      const pan = context.createStereoPanner();
      pan.pan.value = track.pan;
      gain.connect(pan).connect(destination);
      const eq = this.equalize(context, track.eq, gain, liveEq !== undefined);
      liveEq?.set(track.id, eq.filters);
      for (const clip of track.clips) {
        const slice = playSlice(clip, from);
        if (!slice) continue;
        const source = context.createBufferSource();
        source.buffer = await this.load(clip.url);
        const fade = context.createGain();
        const points = fadePoints(clip, from);
        points.forEach((point, index) => {
          if (index === 0) fade.gain.setValueAtTime(point.gain, at + point.at);
          else fade.gain.linearRampToValueAtTime(point.gain, at + point.at);
        });
        source.connect(fade).connect(eq.input);
        source.start(at + slice.wait, slice.offset, slice.length);
        sources.push(source);
      }
    }
    return sources;
  }

  /**
   * Opens a file from your device before it's uploaded, to be sure this
   * browser can play it. Null when it can't (an unsupported format).
   */
  async decodeFile(file: Blob): Promise<AudioBuffer | null> {
    try {
      return await this.audio().decodeAudioData(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  /** Keeps audio already decoded (a checked upload) for its address in storage. */
  remember(url: string, buffer: AudioBuffer) {
    this.buffers.set(url, Promise.resolve(buffer));
  }

  /** Peaks for drawing a waveform: `buckets` values from 0 to 1. */
  async peaks(url: string, buckets: number) {
    const buffer = await this.load(url);
    const data = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / buckets));
    const out = new Float32Array(buckets);
    for (let bucket = 0; bucket < buckets; bucket++) {
      let peak = 0;
      const start = bucket * size;
      for (let i = start; i < Math.min(start + size, data.length); i += 16)
        peak = Math.max(peak, Math.abs(data[i]!));
      out[bucket] = peak;
    }
    return out;
  }

  /** Plays the mix from `from` seconds. Calls `onEnd` when the last clip finishes. */
  async play(
    tracks: MixTrack[],
    from: number,
    master: { volume: number; eq?: MixEq },
    onEnd: () => void,
  ) {
    this.stop();
    const context = this.audio();
    if (context.state === "suspended") await context.resume();
    const heard = audible(tracks);
    await this.loadAll(heard);
    const volume = context.createGain();
    volume.gain.value = master.volume;
    volume.connect(context.destination);
    const masterEq = this.equalize(context, master.eq, volume, true);
    const trackEq = new Map<string, EqFilters>();
    const now = context.currentTime + 0.05;
    const sources = await this.schedule(context, heard, from, now, masterEq.input, trackEq);
    this.playing = {
      sources,
      master: volume,
      eq: { master: masterEq.filters, tracks: trackEq },
      startedAt: now,
      from,
    };
    const ends = Math.max(0, mixLength(heard) - from);
    const timer = window.setTimeout(
      () => {
        if (this.playing?.sources === sources) onEnd();
      },
      ends * 1000 + 100,
    );
    this.stopTimer = () => window.clearTimeout(timer);
  }

  /** Where the playhead is now, in seconds on the timeline (null when stopped). */
  position() {
    if (!this.playing || !this.context) return null;
    return this.playing.from + Math.max(0, this.context.currentTime - this.playing.startedAt);
  }

  setMasterVolume(volume: number) {
    if (this.playing) this.playing.master.gain.value = volume;
  }

  /** Moves the whole mix's EQ while it plays. */
  setMasterEq(eq: MixEq) {
    if (this.playing) tune(this.playing.eq.master, eq);
  }

  /** Moves one track's EQ while it plays. */
  setTrackEq(trackId: string, eq: MixEq) {
    const filters = this.playing?.eq.tracks.get(trackId);
    if (filters) tune(filters, eq);
  }

  stop() {
    this.stopTimer();
    if (!this.playing) return;
    for (const source of this.playing.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.playing.master.disconnect();
    this.playing = null;
  }

  /** The whole mix as a WAV file (what you hear: mutes, solos, volumes and EQ applied). */
  exportWav(tracks: MixTrack[], master: { volume: number; eq?: MixEq }) {
    const heard = audible(tracks);
    return this.render(heard, mixLength(heard), master);
  }

  /**
   * One track alone (all its clips) as a WAV as long as `length`: it plays
   * exactly where it does in the mix, so stems line up with the song. It
   * keeps its own EQ; the whole mix's volume and EQ are left out.
   */
  stemWav(track: MixTrack, length: number) {
    return this.render([{ ...track, muted: false, soloed: false }], length, { volume: 1 });
  }

  /** Renders tracks offline (faster than real time) into a stereo WAV of `length` seconds. */
  private async render(tracks: MixTrack[], length: number, master: { volume: number; eq?: MixEq }) {
    if (length <= 0)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "Add a track before exporting.",
      });
    await this.loadAll(tracks);
    const offline = new OfflineAudioContext(2, Math.ceil(length * EXPORT_RATE), EXPORT_RATE);
    const volume = offline.createGain();
    volume.gain.value = master.volume;
    volume.connect(offline.destination);
    const masterEq = this.equalize(offline, master.eq, volume, false);
    await this.schedule(offline, tracks, 0, 0, masterEq.input);
    const rendered = await offline.startRendering();
    const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
    return new Blob([encodeWav(channels, EXPORT_RATE)], { type: "audio/wav" });
  }

  close() {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
