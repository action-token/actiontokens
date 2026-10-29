import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { addStem, listStems, removeStem, STEM_COLORS, updateStem } from "../services/artist/stems";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

type Row = Record<string, unknown>;
const artist = { id: "a1" };

function setup(
  opts: { song?: Row | null; stem?: Row | null; count?: number; last?: number | null } = {},
) {
  const db = {
    item: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.song === undefined ? { id: "i1", media: { durationSec: 200 } } : opts.song,
        ),
    },
    itemStem: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(opts.count ?? 0),
      aggregate: vi
        .fn()
        .mockResolvedValue({ _max: { trackIndex: opts.last === undefined ? null : opts.last } }),
      create: vi.fn(({ data }: { data: Row }) => Promise.resolve({ id: "s1", ...data })),
      findFirst: vi
        .fn()
        .mockResolvedValue(opts.stem === undefined ? { id: "s1", itemId: "i1" } : opts.stem),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db };
}

const stem = {
  itemId: "i1",
  name: "Vocals",
  audio: { url: "https://cdn.example/vocals.wav", durationSec: 200 },
};

describe("addStem", () => {
  it("adds the first stem to the artist's own song, with a colour and its place in the mixer", async () => {
    const { ctx, db } = setup();
    await expect(addStem(ctx, artist, stem)).resolves.toEqual({ stemId: "s1" });
    expect(db.itemStem.create).toHaveBeenCalledWith({
      data: {
        itemId: "i1",
        name: "Vocals",
        sourceUrl: "https://cdn.example/vocals.wav",
        color: STEM_COLORS[0],
        trackIndex: 0,
        endSec: 200,
      },
      select: { id: true },
    });
  });

  it("puts each new stem after the last and cycles through the colours", async () => {
    const { ctx, db } = setup({ count: 3, last: 3 });
    await addStem(ctx, artist, { ...stem, name: "Drums" });
    expect(db.itemStem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackIndex: 4,
          color: STEM_COLORS[3 % STEM_COLORS.length],
        }) as unknown,
      }),
    );
  });

  it("stops at 8 stems, and checks the name and the file", async () => {
    await expect(addStem(setup({ count: 8 }).ctx, artist, stem)).rejects.toMatchObject({
      message: "A song can have up to 8 stems.",
    });
    await expect(addStem(setup().ctx, artist, { ...stem, name: " " })).rejects.toMatchObject({
      message: "Name the stem, for example Vocals.",
    });
    await expect(
      addStem(setup().ctx, artist, {
        ...stem,
        audio: { ...stem.audio, url: "https://evil.example/v.wav" },
      }),
    ).rejects.toMatchObject({ message: "Upload the file again." });
    await expect(
      addStem(setup().ctx, artist, { ...stem, audio: { ...stem.audio, durationSec: 0 } }),
    ).rejects.toMatchObject({ message: "We couldn't read the stem's length. Try the file again." });
  });

  it("only works on the artist's own song", async () => {
    await expect(addStem(setup({ song: null }).ctx, artist, stem)).rejects.toMatchObject({
      message: "Song not found",
    });
  });
});

describe("updateStem and removeStem", () => {
  it("renames or recolours a stem of the artist's own song", async () => {
    const { ctx, db } = setup();
    await updateStem(ctx, artist, { stemId: "s1", name: "Lead vocal", color: "#ff6b6b" });
    expect(db.itemStem.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "Lead vocal", color: "#ff6b6b" },
    });
  });

  it("only takes a colour that is a hex code", async () => {
    await expect(
      updateStem(setup().ctx, artist, { stemId: "s1", color: "red" }),
    ).rejects.toMatchObject({ message: "Pick a colour." });
  });

  it("removes a stem", async () => {
    const { ctx, db } = setup();
    await removeStem(ctx, artist, "s1");
    expect(db.itemStem.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("won't touch a stem that isn't theirs", async () => {
    await expect(removeStem(setup({ stem: null }).ctx, artist, "s1")).rejects.toMatchObject({
      message: "Stem not found",
    });
    await expect(
      updateStem(setup({ stem: null }).ctx, artist, { stemId: "s1", name: "x" }),
    ).rejects.toMatchObject({ message: "Stem not found" });
  });
});

describe("listStems", () => {
  it("lists a song's stems in mixer order", async () => {
    const { ctx, db } = setup();
    db.itemStem.findMany.mockResolvedValue([
      { id: "s1", name: "Vocals", color: "#dbdc2c", trackIndex: 0, endSec: 200 },
    ]);
    await expect(listStems(ctx, artist, "i1")).resolves.toEqual([
      { id: "s1", name: "Vocals", color: "#dbdc2c", durationSec: 200 },
    ]);
    expect(db.itemStem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId: "i1" },
        orderBy: [{ trackIndex: "asc" }, { createdAt: "asc" }],
      }),
    );
  });
});
