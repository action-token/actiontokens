import { describe, expect, it, vi } from "vitest";

import { MixEngine } from "./engine";
import type { MixClip, MixTrack } from "./mix";

/** Just enough of Web Audio to see what the engine builds and starts. */
function fakeAudio() {
  const sources: { buffer: unknown; start: ReturnType<typeof vi.fn>; fade?: FakeGain }[] = [];
  type FakeGain = {
    gain: {
      value: number;
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: (node: unknown) => unknown;
  };
  const gains: FakeGain[] = [];
  const pans: { pan: { value: number }; connect: (node: unknown) => unknown }[] = [];
  const chain = (node: unknown) => node;
  const context = {
    createGain: () => {
      const gain: FakeGain = {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: chain,
      };
      gains.push(gain);
      return gain;
    },
    createStereoPanner: () => {
      const pan = { pan: { value: 0 }, connect: chain };
      pans.push(pan);
      return pan;
    },
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        start: vi.fn(),
        connect: (node: unknown) => {
          (source as { fade?: unknown }).fade = node;
          return node;
        },
      };
      sources.push(source);
      return source;
    },
  };
  return { context, sources, gains, pans };
}

const clip = (over: Partial<MixClip> = {}): MixClip => ({
  id: "c1",
  url: "https://bucket/a.wav",
  startTime: 0,
  trimStart: 0,
  trimEnd: 0,
  duration: 8,
  fadeIn: 0,
  fadeOut: 0,
  ...over,
});
const track = (clips: MixClip[], over: Partial<MixTrack> = {}): MixTrack => ({
  id: "t1",
  name: "Track",
  color: "#fff",
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
  clips,
  ...over,
});

function engineWith(urls: string[]) {
  const engine = new MixEngine();
  const buffers = (engine as unknown as { buffers: Map<string, Promise<unknown>> }).buffers;
  for (const url of urls) buffers.set(url, Promise.resolve({ duration: 8, url }));
  const schedule = (
    context: unknown,
    tracks: MixTrack[],
    from: number,
    at: number,
  ): Promise<{ start: ReturnType<typeof vi.fn> }[]> =>
    (engine as unknown as { schedule: (...args: unknown[]) => Promise<never> }).schedule(
      context,
      tracks,
      from,
      at,
      {},
    );
  return { schedule };
}

describe("scheduling a mix", () => {
  it("starts every clip of a track on the shared clock, with its volume and pan", async () => {
    const { context, sources, gains, pans } = fakeAudio();
    const { schedule } = engineWith(["https://bucket/a.wav"]);
    const t = track([clip(), clip({ id: "c2", startTime: 10, trimStart: 1, trimEnd: 2 })], {
      volume: 0.8,
      pan: -0.5,
    });
    await schedule(context, [t], 0, 5);
    expect(sources).toHaveLength(2);
    expect(sources[0]!.start).toHaveBeenCalledWith(5, 0, 8);
    expect(sources[1]!.start).toHaveBeenCalledWith(15, 1, 5);
    expect(pans).toHaveLength(1);
    expect(pans[0]!.pan.value).toBe(-0.5);
    expect(gains[0]!.gain.value).toBe(0.8);
  });

  it("starts partway in when playing from the middle, and skips clips already over", async () => {
    const { context, sources } = fakeAudio();
    const { schedule } = engineWith(["https://bucket/a.wav"]);
    const t = track([clip(), clip({ id: "c2", startTime: 10 })]);
    await schedule(context, [t], 3, 0);
    expect(sources).toHaveLength(2);
    expect(sources[0]!.start).toHaveBeenCalledWith(0, 3, 5);
    expect(sources[1]!.start).toHaveBeenCalledWith(7, 0, 8);
    sources.length = 0;
    await schedule(context, [t], 9, 0);
    expect(sources).toHaveLength(1);
  });

  it("ramps a clip's volume through its fades", async () => {
    const { context, sources } = fakeAudio();
    const { schedule } = engineWith(["https://bucket/a.wav"]);
    await schedule(context, [track([clip({ startTime: 2, fadeIn: 2, fadeOut: 3 })])], 0, 10);
    const fade = (
      sources[0] as unknown as {
        fade: { gain: { setValueAtTime: any; linearRampToValueAtTime: any } };
      }
    ).fade.gain;
    expect(fade.setValueAtTime).toHaveBeenCalledWith(0, 12);
    expect(fade.linearRampToValueAtTime.mock.calls).toEqual([
      [1, 14],
      [1, 17],
      [0, 20],
    ]);
  });

  it("leaves a clip without fades at full volume", async () => {
    const { context, sources } = fakeAudio();
    const { schedule } = engineWith(["https://bucket/a.wav"]);
    await schedule(context, [track([clip()])], 0, 0);
    const fade = (sources[0] as unknown as { fade: { gain: { setValueAtTime: any } } }).fade.gain;
    expect(fade.setValueAtTime).not.toHaveBeenCalled();
  });
});
