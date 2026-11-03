"use client";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { audible, mixLength, type MixTrack, playSlice } from "./mix";
import { encodeWav } from "./wav";

const EXPORT_RATE = 44_100;

/**
 * The mixer's sound, on the browser's Web Audio. Files are fetched and decoded
 * once; playing schedules every audible track at once on one clock, so they
 * stay in time; exporting renders the same schedule offline (faster than real
 * time) into a WAV file.
 */
export class MixEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private stopTimer: () => void = () => undefined;
  private playing: {
    sources: AudioBufferSourceNode[];
    master: GainNode;
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
  async play(tracks: MixTrack[], from: number, masterVolume: number, onEnd: () => void) {
    this.stop();
    const context = this.audio();
    if (context.state === "suspended") await context.resume();
    const heard = audible(tracks);
    const buffers = await Promise.all(heard.map((track) => this.load(track.url)));
    const master = context.createGain();
    master.gain.value = masterVolume;
    master.connect(context.destination);
    const now = context.currentTime + 0.05;
    const sources: AudioBufferSourceNode[] = [];
    heard.forEach((track, index) => {
      const slice = playSlice(track, from);
      if (!slice) return;
      const source = context.createBufferSource();
      source.buffer = buffers[index]!;
      const gain = context.createGain();
      gain.gain.value = track.volume;
      source.connect(gain).connect(master);
      source.start(now + slice.wait, slice.offset, slice.length);
      sources.push(source);
    });
    this.playing = { sources, master, startedAt: now, from };
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

  /** The whole mix as a WAV file (what you hear: mutes, solos and volumes applied). */
  async exportWav(tracks: MixTrack[], masterVolume: number) {
    const heard = audible(tracks);
    const length = mixLength(heard);
    if (length <= 0)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: "Add a track before exporting.",
      });
    const buffers = await Promise.all(heard.map((track) => this.load(track.url)));
    const offline = new OfflineAudioContext(2, Math.ceil(length * EXPORT_RATE), EXPORT_RATE);
    const master = offline.createGain();
    master.gain.value = masterVolume;
    master.connect(offline.destination);
    heard.forEach((track, index) => {
      const slice = playSlice(track, 0);
      if (!slice) return;
      const source = offline.createBufferSource();
      source.buffer = buffers[index]!;
      const gain = offline.createGain();
      gain.gain.value = track.volume;
      source.connect(gain).connect(master);
      source.start(slice.wait, slice.offset, slice.length);
    });
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
