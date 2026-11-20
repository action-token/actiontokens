import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { PREVIEW_SECONDS } from "../services/media/playback";
import { stemsFor } from "../services/media/stems";
import { createCallerFactory } from "../trpc";
import { wavPreview } from "../services/media/wav";

const stemRows = [
  { id: "s1", name: "Drums", color: "#f0b429", trackIndex: 0 },
  { id: "s2", name: "Bass", color: "#4aa3df", trackIndex: 1 },
];

function setup({
  owns = false,
  creator = false,
  stems = stemRows,
}: { owns?: boolean; creator?: boolean; stems?: typeof stemRows } = {}) {
  return {
    item: {
      findFirst: vi.fn().mockResolvedValue({
        createdById: creator ? "me" : "other",
        organization: { userId: "artist-user" },
        stems,
      }),
    },
    ownership: { findUnique: vi.fn().mockResolvedValue(owns ? { quantity: "1" } : null) },
    activityLog: { create: vi.fn() },
  };
}
const asDb = (db: object) => db as unknown as Db;

describe("stemsFor", () => {
  it("gives owners the full stems, in order, through the app's own route", async () => {
    const result = await stemsFor(asDb(setup({ owns: true })), "me", "i1");
    expect(result).toEqual({
      full: true,
      previewSeconds: null,
      stems: [
        { id: "s1", name: "Drums", color: "#f0b429", url: "/api/media/stem/s1" },
        { id: "s2", name: "Bass", color: "#4aa3df", url: "/api/media/stem/s2" },
      ],
    });
  });

  it("gives the song's creator and its artist the full stems too", async () => {
    expect((await stemsFor(asDb(setup({ creator: true })), "me", "i1")).full).toBe(true);
  });

  it("gives everyone else the same stems, but only the first 30 seconds", async () => {
    const guest = await stemsFor(asDb(setup()), null, "i1");
    expect(guest).toMatchObject({ full: false, previewSeconds: PREVIEW_SECONDS });
    expect(guest.stems).toHaveLength(2);
    expect((await stemsFor(asDb(setup()), "someone", "i1")).full).toBe(false);
  });

  it("has nothing for a song without stems", async () => {
    await expect(stemsFor(asDb(setup({ stems: [] })), "me", "i1")).resolves.toEqual({
      full: false,
      previewSeconds: null,
      stems: [],
    });
  });

  it("is open to signed-out visitors through the router", async () => {
    const db = setup();
    const caller = createCallerFactory(appRouter)(
      createContext({ db: asDb(db), chain: {} as ChainGateway, app: "app", session: null }),
    );
    await expect(caller.media.stems({ itemId: "i1" })).resolves.toMatchObject({ full: false });
  });
});

/** A canonical 44-byte WAV header for 16-bit PCM. */
function header(seconds: number, rate = 22050, channels = 1) {
  const bytes = new DataView(new ArrayBuffer(44));
  const dataLength = seconds * rate * channels * 2;
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => bytes.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  bytes.setUint32(4, 36 + dataLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, channels, true);
  bytes.setUint32(24, rate, true);
  bytes.setUint32(28, rate * channels * 2, true);
  bytes.setUint16(32, channels * 2, true);
  bytes.setUint16(34, 16, true);
  text(36, "data");
  bytes.setUint32(40, dataLength, true);
  return new Uint8Array(bytes.buffer);
}

describe("wavPreview", () => {
  it("works out which bytes hold the first 30 s, and a header that says so", () => {
    const cut = wavPreview(header(120), 30);
    expect(cut).not.toBeNull();
    expect(cut!.range).toEqual({ start: 44, end: 44 + 30 * 22050 * 2 - 1 });
    const view = new DataView(cut!.header.buffer);
    expect(view.getUint32(40, true)).toBe(30 * 22050 * 2);
    expect(view.getUint32(4, true)).toBe(36 + 30 * 22050 * 2);
  });

  it("keeps a short file whole", () => {
    expect(wavPreview(header(10), 30)!.range).toEqual({ start: 44, end: 44 + 10 * 22050 * 2 - 1 });
  });

  it("says no for anything that isn't a plain PCM WAV", () => {
    expect(wavPreview(new Uint8Array(44), 30)).toBeNull();
    expect(wavPreview(new Uint8Array(10), 30)).toBeNull();
  });
});
