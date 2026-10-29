import { audibleGain, clampPan, type Mix } from "./mix";

export type LoadedStem = { id: string; name: string; color: string; buffer: AudioBuffer };

type Voice = {
  stem: LoadedStem;
  gain: GainNode;
  pan: StereoPannerNode;
  source: AudioBufferSourceNode | null;
};

/**
 * Plays several stems as one song. Each stem is its own audio buffer; all of
 * them are started at the same instant from the same position, so they stay
 * in step. The mix (volume, pan, mute, solo) is applied live through one gain
 * and pan node per stem. Seeking and resuming restart every stem together.
 */
export class StemEngine {
  private readonly ctx = new AudioContext();
  private readonly voices: Voice[];
  private startedAt = 0;
  private offset = 0;
  private running = false;
  /** Called when playback reaches the end by itself */
  onEnded: (() => void) | null = null;

  readonly duration: number;

  constructor(stems: LoadedStem[]) {
    this.duration = Math.max(0, ...stems.map((stem) => stem.buffer.duration));
    this.voices = stems.map((stem) => {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      gain.connect(pan).connect(this.ctx.destination);
      return { stem, gain, pan, source: null };
    });
  }

  get playing() {
    return this.running;
  }

  get position() {
    const at = this.running ? this.ctx.currentTime - this.startedAt : this.offset;
    return Math.min(this.duration, Math.max(0, at));
  }

  apply(mix: Mix) {
    const now = this.ctx.currentTime;
    for (const { stem, gain, pan } of this.voices) {
      // A short ramp, so moving a slider never clicks.
      gain.gain.setTargetAtTime(audibleGain(mix, stem.id), now, 0.015);
      pan.pan.setTargetAtTime(clampPan(mix[stem.id]?.pan ?? 0), now, 0.015);
    }
  }

  async play() {
    if (this.running) return;
    await this.ctx.resume();
    if (this.offset >= this.duration) this.offset = 0;
    const at = this.ctx.currentTime + 0.05;
    let first = true;
    for (const voice of this.voices) {
      const source = this.ctx.createBufferSource();
      source.buffer = voice.stem.buffer;
      source.connect(voice.gain);
      if (first) {
        source.onended = () => {
          // Only the natural end counts; stopping to pause or seek clears the handler first.
          if (this.running && source === voice.source) {
            this.running = false;
            this.offset = 0;
            this.onEnded?.();
          }
        };
        first = false;
      }
      source.start(at, this.offset);
      voice.source = source;
    }
    this.startedAt = at - this.offset;
    this.running = true;
  }

  pause() {
    if (!this.running) return;
    this.offset = this.position;
    this.running = false;
    this.stopSources();
  }

  async seek(seconds: number) {
    const wasPlaying = this.running;
    if (wasPlaying) this.pause();
    this.offset = Math.min(this.duration, Math.max(0, seconds));
    if (wasPlaying) await this.play();
  }

  close() {
    this.running = false;
    this.stopSources();
    void this.ctx.close();
  }

  private stopSources() {
    for (const voice of this.voices) {
      if (!voice.source) continue;
      voice.source.onended = null;
      try {
        voice.source.stop();
      } catch {
        // Already stopped.
      }
      voice.source.disconnect();
      voice.source = null;
    }
  }
}
