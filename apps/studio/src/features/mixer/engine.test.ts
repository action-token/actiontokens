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

describe("the EQ", () => {
  /** Web Audio with nodes that remember what they were connected to. */
  function wiredAudio() {
    type Node = { kind: string; to?: Node; [key: string]: unknown };
    const filters: Node[] = [];
    const node = (kind: string, extra: Record<string, unknown> = {}): Node => {
      const made: Node = {
        kind,
        ...extra,
        connect: (next: Node) => {
          made.to = next;
          return next;
        },
        disconnect: () => undefined,
      };
      return made;
    };
    const param = (value = 0) => ({
      value,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    });
    const sources: Node[] = [];
    const context = {
      currentTime: 0,
      state: "running",
      destination: node("out"),
      createGain: () => node("gain", { gain: param(1) }),
      createStereoPanner: () => node("pan", { pan: param() }),
      createBiquadFilter: () => {
        const filter = node("filter", { type: "", frequency: param(), Q: param(), gain: param() });
        filters.push(filter);
        return filter;
      },
      createBufferSource: () => {
        const source = node("source", { buffer: null, start: vi.fn(), stop: vi.fn() });
        sources.push(source);
        return source;
      },
    };
    /** The kinds of node the sound passes through from `from` to the output. */
    const path = (from: Node) => {
      const kinds: string[] = [];
      for (let at: Node | undefined = from; at; at = at.to)
        kinds.push(at.kind === "filter" ? (at.type as string) : at.kind);
      return kinds;
    };
    return { context, filters, sources, path };
  }

  function playable() {
    const engine = new MixEngine();
    const inner = engine as unknown as {
      buffers: Map<string, Promise<unknown>>;
      context: unknown;
      schedule: (...args: unknown[]) => Promise<unknown>;
      equalize: (...args: unknown[]) => { input: unknown; filters: Record<string, unknown> };
    };
    inner.buffers.set("https://bucket/a.wav", Promise.resolve({ duration: 8 }));
    return { engine, inner };
  }

  it("adds no filters to a flat track or mix when exporting", async () => {
    const { context, filters, sources, path } = wiredAudio();
    const { inner } = playable();
    await inner.schedule(context, [track([clip()])], 0, 0, context.destination);
    expect(filters).toHaveLength(0);
    // source → fade → volume → pan → out, as before the EQ existed
    expect(path(sources[0] as never)).toEqual(["source", "gain", "gain", "pan", "out"]);
    expect(inner.equalize(context, undefined, context.destination, false).input).toBe(
      context.destination,
    );
  });

  it("runs a track through only the bands it uses, before its volume", async () => {
    const { context, filters, sources, path } = wiredAudio();
    const { inner } = playable();
    const eq = { low: 4, mid: 0, high: -6 };
    await inner.schedule(context, [track([clip()], { eq })], 0, 0, context.destination);
    expect(path(sources[0] as never)).toEqual([
      "source",
      "gain",
      "lowshelf",
      "highshelf",
      "gain",
      "pan",
      "out",
    ]);
    const byType = Object.fromEntries(filters.map((filter) => [filter.type, filter]));
    expect(byType.lowshelf).toMatchObject({ frequency: { value: 100 }, gain: { value: 4 } });
    expect(byType.highshelf).toMatchObject({ frequency: { value: 8000 }, gain: { value: -6 } });
  });

  it("gives the mid band its peak at 1 kHz", () => {
    const { context, filters } = wiredAudio();
    const { inner } = playable();
    inner.equalize(context, { low: 0, mid: 5, high: 0 }, context.destination, false);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({
      type: "peaking",
      frequency: { value: 1000 },
      Q: { value: 1 },
      gain: { value: 5 },
    });
  });

  it("keeps every band in the chain while playing, and moves them with the sliders", async () => {
    const { context, filters } = wiredAudio();
    const { engine, inner } = playable();
    inner.context = context;
    vi.stubGlobal("window", { setTimeout: () => 1, clearTimeout: () => undefined });
    await engine.play([track([clip()])], 0, { volume: 0.9 }, () => undefined);
    // three for the track, three for the mix, all at 0 dB
    expect(filters).toHaveLength(6);
    expect(filters.every((filter) => (filter.gain as { value: number }).value === 0)).toBe(true);

    engine.setTrackEq("t1", { low: 2, mid: 3, high: 4 });
    engine.setMasterEq({ low: -1, mid: -2, high: -3 });
    const gains = (type: string) =>
      filters
        .filter((filter) => filter.type === type)
        .map((filter) => (filter.gain as { value: number }).value)
        .sort((a, b) => a - b);
    expect(gains("lowshelf")).toEqual([-1, 2]);
    expect(gains("peaking")).toEqual([-2, 3]);
    expect(gains("highshelf")).toEqual([-3, 4]);
    engine.stop();
    vi.unstubAllGlobals();
  });

  it("renders a stem with its own EQ but not the mix's volume or EQ", async () => {
    const { engine } = playable();
    const render = vi
      .spyOn(engine as unknown as { render: (...args: unknown[]) => Promise<Blob> }, "render")
      .mockResolvedValue(new Blob());
    const eq = { low: 1, mid: 2, high: 3 };
    await engine.stemWav(track([clip()], { eq, muted: true }), 10);
    expect(render).toHaveBeenCalledWith([expect.objectContaining({ eq, muted: false })], 10, {
      volume: 1,
    });
    await engine.exportWav([track([clip()])], { volume: 0.5, eq });
    expect(render).toHaveBeenLastCalledWith(expect.any(Array), 8, { volume: 0.5, eq });
  });
});
