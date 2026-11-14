import { AppError, ErrorCodes } from "@bandcoin/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { liveTicket, readTicket, saveLiveRecording } from "../services/studio/live";
import { liveConfigOf, LiveSession, type LiveOut } from "../services/studio/live-session";
import { LIVE_SCALES, type LiveEvents, type LiveLyria } from "../services/studio/lyria";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://bucket/"),
}));

const live = vi.hoisted(() => ({
  endLiveRun: vi.fn(),
  holdLiveMinute: vi.fn(),
  keepLiveMinute: vi.fn(),
  livePrice: vi.fn(),
  refundLiveMinute: vi.fn(),
  startLiveRun: vi.fn(),
}));
vi.mock("../services/studio/live", async (original) => ({
  ...(await original<typeof import("../services/studio/live")>()),
  ...live,
}));

describe("live tickets", () => {
  beforeEach(() => vi.stubEnv("NEXTAUTH_SECRET", "test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("names the user while the ticket is fresh", () => {
    expect(readTicket(liveTicket("u1", 1_000), 2_000)).toBe("u1");
  });

  it("refuses an expired ticket", () => {
    expect(readTicket(liveTicket("u1", 1_000), 1_000 + 61_000)).toBeNull();
  });

  it("refuses a ticket with another user swapped in", () => {
    const [, signature] = liveTicket("u1", 1_000).split(".");
    const forged = Buffer.from(JSON.stringify({ u: "u2", e: 99_999_999 })).toString("base64url");
    expect(readTicket(`${forged}.${signature}`, 2_000)).toBeNull();
  });

  it("refuses missing and garbled tickets", () => {
    expect(readTicket(null)).toBeNull();
    expect(readTicket("nope")).toBeNull();
    expect(readTicket("a.b")).toBeNull();
  });
});

describe("saving a recording", () => {
  it("keeps it with the live run", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const ctx = { db: { generation: { updateMany } } } as never;
    await saveLiveRecording(ctx, { id: "u1" } as never, {
      generationId: "g1",
      url: "https://bucket/jam.wav",
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1", userId: "u1", model: "lyria-realtime-exp" } }),
    );
  });

  const user = { id: "u1", role: "FAN", walletAddress: null, walletType: null } as never;

  it("refuses a file that isn't ours", async () => {
    const ctx = { db: { generation: { updateMany: vi.fn() } } } as never;
    await expect(
      saveLiveRecording(ctx, user, { generationId: "g1", url: "https://evil.example/a.wav" }),
    ).rejects.toThrow(/Upload the recording again/);
  });
});

const MINUTE = 60_000;

function setup(over: { holdFails?: boolean } = {}) {
  let clock = 0;
  const sent: LiveOut[] = [];
  const lyria: LiveLyria = {
    setWeightedPrompts: vi.fn().mockResolvedValue(undefined),
    setMusicGenerationConfig: vi.fn().mockResolvedValue(undefined),
    resetContext: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    close: vi.fn(),
  };
  let events!: LiveEvents;
  let held = 0;
  live.livePrice.mockResolvedValue(7);
  live.startLiveRun.mockResolvedValue("run1");
  live.holdLiveMinute.mockImplementation(() => {
    if (over.holdFails) return Promise.reject(new Error("db"));
    held += 1;
    return Promise.resolve(`entry${held}`);
  });
  const session = new LiveSession({} as never, "u1", {
    connect: (e) => {
      events = e;
      return Promise.resolve(lyria);
    },
    send: (message) => sent.push(message),
    now: () => clock,
    tickMs: 1_000_000,
  });
  return {
    session,
    sent,
    lyria,
    events: () => events,
    advance: (ms: number) => (clock += ms),
  };
}

describe("a live session's billing", () => {
  beforeEach(() => {
    Object.values(live).forEach((fn) => fn.mockReset());
  });

  it("is free until Play, then takes the first minute", async () => {
    const { session, sent, lyria } = setup();
    await session.open();
    expect(sent).toEqual([{ type: "ready", pricePerMinute: 7 }]);
    expect(live.holdLiveMinute).not.toHaveBeenCalled();
    await session.handle({ type: "play" });
    expect(live.holdLiveMinute).toHaveBeenCalledWith(
      {},
      { userId: "u1", generationId: "run1", minute: 1, coins: 7 },
    );
    expect(lyria.play).toHaveBeenCalled();
    expect(sent.at(-1)).toEqual({ type: "charged", minutes: 1, coins: 7, generationId: "run1" });
    await session.close();
  });

  it("keeps the minute once music arrives in it", async () => {
    const { session, events, sent } = setup();
    await session.open();
    await session.handle({ type: "play" });
    events().onAudio("AAAA");
    events().onAudio("BBBB");
    expect(live.keepLiveMinute).toHaveBeenCalledTimes(1);
    expect(live.keepLiveMinute).toHaveBeenCalledWith({}, "entry1");
    expect(sent.filter((m) => m.type === "audio")).toHaveLength(2);
    await session.close();
    expect(live.refundLiveMinute).not.toHaveBeenCalled();
    expect(live.endLiveRun).toHaveBeenCalledWith({}, "run1", undefined);
  });

  it("refunds a minute that never got music when the jam ends", async () => {
    const { session } = setup();
    await session.open();
    await session.handle({ type: "play" });
    await session.close();
    expect(live.refundLiveMinute).toHaveBeenCalledWith({}, "entry1", "run1", 7);
  });

  it("charges the next minute only when playing reaches it", async () => {
    const { session, events, advance, sent } = setup();
    await session.open();
    await session.handle({ type: "play" });
    events().onAudio("AAAA");
    advance(MINUTE - 1);
    await session.tick();
    expect(live.holdLiveMinute).toHaveBeenCalledTimes(1);
    advance(2);
    await session.tick();
    expect(live.holdLiveMinute).toHaveBeenCalledTimes(2);
    expect(sent.at(-1)).toMatchObject({ type: "charged", minutes: 2, coins: 14 });
    await session.close();
  });

  it("stops the clock while paused", async () => {
    const { session, events, advance, lyria } = setup();
    await session.open();
    await session.handle({ type: "play" });
    events().onAudio("AAAA");
    advance(30_000);
    await session.handle({ type: "pause" });
    expect(lyria.pause).toHaveBeenCalled();
    advance(10 * MINUTE);
    await session.tick();
    expect(session.played()).toBe(30_000);
    expect(live.holdLiveMinute).toHaveBeenCalledTimes(1);
    advance(0);
    await session.handle({ type: "play" });
    expect(live.holdLiveMinute).toHaveBeenCalledTimes(1);
    await session.close();
  });

  it("pauses and says so when coins run out", async () => {
    const { session, events, advance, sent, lyria } = setup();
    await session.open();
    await session.handle({ type: "play" });
    events().onAudio("AAAA");
    live.holdLiveMinute.mockRejectedValueOnce(
      new AppError(ErrorCodes.VALIDATION_FAILED, { message: "You need 7 coins" }),
    );
    advance(MINUTE + 1);
    await session.tick();
    expect(sent.at(-1)).toMatchObject({ type: "outOfCoins" });
    expect(lyria.pause).toHaveBeenCalled();
    await session.close();
  });

  it("won't start playing when the first minute can't be paid", async () => {
    const { session, sent, lyria } = setup({ holdFails: true });
    await session.open();
    await session.handle({ type: "play" });
    expect(sent.at(-1)).toMatchObject({ type: "outOfCoins" });
    expect(lyria.play).not.toHaveBeenCalled();
    await session.close();
  });

  it("ends at 30 minutes", async () => {
    const { session, events, advance, sent, lyria } = setup();
    await session.open();
    await session.handle({ type: "play" });
    events().onAudio("AAAA");
    advance(30 * MINUTE);
    await session.tick();
    expect(sent.at(-1)).toMatchObject({ type: "ended" });
    expect(lyria.close).toHaveBeenCalled();
  });

  it("keeps prompts to four and the settings in range", async () => {
    const { session, lyria } = setup();
    await session.open();
    await session.handle({
      type: "prompts",
      prompts: [1, 2, 3, 4, 5].map((n) => ({ text: ` p${n} `, weight: 9 })),
    });
    expect(lyria.setWeightedPrompts).toHaveBeenCalledWith({
      weightedPrompts: [1, 2, 3, 4].map((n) => ({ text: `p${n}`, weight: 2 })),
    });
    await session.handle({ type: "config", bpm: 999, density: -1, brightness: 0.5 });
    expect(lyria.setMusicGenerationConfig).toHaveBeenCalledWith({
      musicGenerationConfig: { bpm: 200, density: 0, brightness: 0.5 },
    });
    await session.close();
  });

  const lastConfig = (lyria: LiveLyria) =>
    vi.mocked(lyria.setMusicGenerationConfig).mock.calls.at(-1)![0].musicGenerationConfig;

  it("sends the whole of the settings every time, each kept in range", async () => {
    const { session, lyria } = setup();
    await session.open();
    await session.handle({
      type: "config",
      bpm: 120.4,
      density: 0.3,
      brightness: 0.6,
      guidance: 9,
      temperature: -1,
      scale: "D_MAJOR_B_MINOR",
      muteBass: true,
      muteDrums: false,
      onlyBassAndDrums: false,
    });
    const full = {
      bpm: 120,
      density: 0.3,
      brightness: 0.6,
      guidance: 6,
      temperature: 0,
      scale: "D_MAJOR_B_MINOR",
      muteBass: true,
      muteDrums: false,
      onlyBassAndDrums: false,
    };
    expect(lastConfig(lyria)).toEqual(full);
    // Only one thing sent: the rest goes again as it was, or Lyria would reset it.
    await session.handle({ type: "config", guidance: 2 });
    expect(lastConfig(lyria)).toEqual({ ...full, guidance: 2 });
    await session.close();
  });

  it("leaves an unknown key to the model, and lets bass-and-drums win over the mutes", () => {
    expect(liveConfigOf({ scale: "H_MAJOR" })).toEqual({ scale: "SCALE_UNSPECIFIED" });
    expect(liveConfigOf({ scale: "A_FLAT_MAJOR_F_MINOR" })).toEqual({
      scale: "A_FLAT_MAJOR_F_MINOR",
    });
    expect(liveConfigOf({ muteBass: true, muteDrums: true, onlyBassAndDrums: true })).toEqual({
      muteBass: false,
      muteDrums: false,
      onlyBassAndDrums: true,
    });
    expect(liveConfigOf({ muteBass: "yes", guidance: "loud", bpm: Number.NaN })).toEqual({});
    expect(LIVE_SCALES).toHaveLength(13);
  });

  it("restarts the groove for a new tempo or key, but only once music has played", async () => {
    const { session, lyria } = setup();
    await session.open();
    // Before the first Play there is nothing to restart.
    await session.handle({ type: "config", bpm: 100, scale: "SCALE_UNSPECIFIED" });
    expect(lyria.resetContext).not.toHaveBeenCalled();
    await session.handle({ type: "play" });

    await session.handle({ type: "config", density: 0.9, guidance: 3, muteDrums: true });
    expect(lyria.resetContext).not.toHaveBeenCalled();
    await session.handle({ type: "config", bpm: 140 });
    expect(lyria.resetContext).toHaveBeenCalledTimes(1);
    await session.handle({ type: "config", bpm: 140 });
    expect(lyria.resetContext).toHaveBeenCalledTimes(1);
    await session.handle({ type: "config", scale: "G_MAJOR_E_MINOR" });
    expect(lyria.resetContext).toHaveBeenCalledTimes(2);
    // Paused counts too: the groove is still there when Play comes back.
    await session.handle({ type: "pause" });
    await session.handle({ type: "config", bpm: 90 });
    expect(lyria.resetContext).toHaveBeenCalledTimes(3);
    await session.close();
  });
});
