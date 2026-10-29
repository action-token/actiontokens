import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";
import {
  createAlbum,
  createSong,
  deleteAlbum,
  getSong,
  listAlbums,
  listSongs,
  updateAlbum,
  updateSong,
} from "../services/artist/music";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

type Row = Record<string, unknown>;

const artist = {
  id: "a1",
  slug: "luna-vale",
  name: "Luna Vale",
  userId: "u1",
  issuerAccountId: "chain1",
};
const user = { id: "u1" };
const song = {
  title: "Gold Hour",
  description: "Single",
  coverUrl: "https://cdn.example/cover.jpg",
  audio: { url: "https://cdn.example/song.mp3", durationSec: 200 },
  previewStartSec: 60,
  code: "goldhour",
  supply: null,
  priceBandcoin: "5",
  priceUsd: "0.1",
  visibility: "PUBLIC" as const,
};

function setup(opts: { album?: Row | null; item?: Row | null; takenAlbumSlug?: string } = {}) {
  const created: Row[] = [];
  const db = {
    chainAccount: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "chain1", publicKey: "GISSUER", activatedAt: new Date() }),
    },
    classicToken: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    album: {
      findFirst: vi.fn().mockResolvedValue(opts.album === undefined ? { id: "al1" } : opts.album),
      findUnique: vi.fn(({ where }: { where: { slug: string } }) =>
        Promise.resolve(where.slug === opts.takenAlbumSlug ? { id: "x" } : null),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(({ data }: { data: Row }) => Promise.resolve({ id: "al1", ...data })),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    item: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(opts.item === undefined ? null : opts.item),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: "i1", slug: data.slug });
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    track: { update: vi.fn().mockResolvedValue({}) },
    itemMedia: { update: vi.fn().mockResolvedValue({}) },
    listing: { update: vi.fn().mockResolvedValue({}) },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db, created };
}

describe("createSong", () => {
  it("creates a classic song with its audio, preview point, track details and first listing", async () => {
    const { ctx, created } = setup();
    await expect(
      createSong(ctx, artist, user, { ...song, albumId: "al1", trackNumber: 2 }),
    ).resolves.toMatchObject({ itemId: "i1" });
    expect(created[0]).toMatchObject({
      type: "TRACK",
      chainType: "CLASSIC_TOKEN",
      title: "Gold Hour",
      visibility: "PUBLIC",
      classicToken: { create: { code: "GOLDHOUR", issuer: "GISSUER" } },
      media: {
        create: {
          mediaType: "AUDIO",
          sourceUrl: "https://cdn.example/song.mp3",
          durationSec: 200,
          previewStartSec: 60,
        },
      },
      track: { create: { artistName: "Luna Vale", albumId: "al1", trackNumber: 2 } },
      listings: {
        create: { kind: "PRIMARY", status: "ACTIVE", priceBandcoin: "5", priceUsd: "0.1" },
      },
    });
  });

  it("works without an album, and credits a different name when asked", async () => {
    const { ctx, created } = setup();
    await createSong(ctx, artist, user, { ...song, artistName: "Luna Vale & Kit" });
    expect(created[0]).toMatchObject({ track: { create: { artistName: "Luna Vale & Kit" } } });
    expect((created[0]!.track as { create: Row }).create.albumId).toBeUndefined();
  });

  it("only files a song in the artist's own album", async () => {
    await expect(
      createSong(setup({ album: null }).ctx, artist, user, { ...song, albumId: "other" }),
    ).rejects.toMatchObject({ message: "Album not found" });
  });

  it("checks the audio: our own storage, a real length, and a preview that fits inside the song", async () => {
    await expect(
      createSong(setup().ctx, artist, user, {
        ...song,
        audio: { url: "https://evil.example/s.mp3", durationSec: 200 },
      }),
    ).rejects.toMatchObject({ message: "Upload the file again." });
    await expect(
      createSong(setup().ctx, artist, user, { ...song, audio: { ...song.audio, durationSec: 0 } }),
    ).rejects.toMatchObject({ message: "We couldn't read the song's length. Try the file again." });
    await expect(
      createSong(setup().ctx, artist, user, { ...song, previewStartSec: 190 }),
    ).rejects.toMatchObject({
      message: "Pick a preview that starts at least 30 seconds before the end.",
    });
    await expect(
      createSong(setup().ctx, artist, user, { ...song, previewStartSec: -1 }),
    ).rejects.toMatchObject({
      message: "Pick a preview that starts at least 30 seconds before the end.",
    });
  });

  it("lets a song under 30 seconds preview from the start", async () => {
    const { ctx, created } = setup();
    await createSong(ctx, artist, user, {
      ...song,
      audio: { ...song.audio, durationSec: 20 },
      previewStartSec: 0,
    });
    expect(created[0]).toMatchObject({ media: { create: { previewStartSec: 0 } } });
  });
});

describe("updateSong", () => {
  const owned = { id: "i1", type: "TRACK" };

  it("moves a song to another album, renumbers it and changes the credited name", async () => {
    const { ctx, db } = setup({ item: owned });
    await updateSong(ctx, artist, {
      itemId: "i1",
      albumId: "al1",
      trackNumber: 3,
      artistName: "Luna Vale & Kit",
    });
    expect(db.track.update).toHaveBeenCalledWith({
      where: { itemId: "i1" },
      data: { albumId: "al1", trackNumber: 3, artistName: "Luna Vale & Kit" },
    });
  });

  it("takes a song out of its album with null", async () => {
    const { ctx, db } = setup({ item: owned });
    await updateSong(ctx, artist, { itemId: "i1", albumId: null, trackNumber: null });
    expect(db.track.update).toHaveBeenCalledWith({
      where: { itemId: "i1" },
      data: { albumId: null, trackNumber: null },
    });
  });

  it("changes where the preview starts, keeping it inside the song", async () => {
    const { ctx, db } = setup({ item: { ...owned, media: { durationSec: 200 } } });
    await updateSong(ctx, artist, { itemId: "i1", previewStartSec: 90 });
    expect(db.itemMedia.update).toHaveBeenCalledWith({
      where: { itemId: "i1" },
      data: { previewStartSec: 90 },
    });
    await expect(
      updateSong(ctx, artist, { itemId: "i1", previewStartSec: 190 }),
    ).rejects.toMatchObject({
      message: "Pick a preview that starts at least 30 seconds before the end.",
    });
  });

  it("only touches the artist's own songs and albums", async () => {
    await expect(
      updateSong(setup({ item: null }).ctx, artist, { itemId: "i1", artistName: "x" }),
    ).rejects.toMatchObject({ message: "Song not found" });
    await expect(
      updateSong(setup({ item: owned, album: null }).ctx, artist, {
        itemId: "i1",
        albumId: "other",
      }),
    ).rejects.toMatchObject({ message: "Album not found" });
  });
});

describe("albums", () => {
  it("creates an album with a page address made from its title", async () => {
    const { ctx, db } = setup();
    await expect(
      createAlbum(ctx, artist, {
        title: "Gold Hour EP",
        description: "Five songs",
        coverUrl: "https://cdn.example/a.jpg",
      }),
    ).resolves.toEqual({ albumId: "al1", slug: "luna-vale-gold-hour-ep" });
    expect(db.album.create).toHaveBeenCalledWith({
      data: {
        artistId: "a1",
        title: "Gold Hour EP",
        slug: "luna-vale-gold-hour-ep",
        description: "Five songs",
        coverUrl: "https://cdn.example/a.jpg",
      },
      select: { id: true, slug: true },
    });
  });

  it("makes the address unique, and takes covers only from our storage", async () => {
    const { ctx, db } = setup({ takenAlbumSlug: "luna-vale-gold-hour-ep" });
    await createAlbum(ctx, artist, {
      title: "Gold Hour EP",
      coverUrl: "https://cdn.example/a.jpg",
    });
    expect((db.album.create.mock.calls[0]![0] as { data: { slug: string } }).data.slug).toMatch(
      /^luna-vale-gold-hour-ep-[a-z0-9]{4}$/,
    );
    await expect(
      createAlbum(setup().ctx, artist, { title: "x", coverUrl: "https://evil.example/a.jpg" }),
    ).rejects.toMatchObject({ message: "Upload the cover again." });
  });

  it("updates title, description and cover of the artist's own album", async () => {
    const { ctx, db } = setup();
    await updateAlbum(ctx, artist, {
      albumId: "al1",
      title: "New",
      description: "",
      coverUrl: "https://cdn.example/b.jpg",
    });
    expect(db.album.update).toHaveBeenCalledWith({
      where: { id: "al1" },
      data: { title: "New", description: null, coverUrl: "https://cdn.example/b.jpg" },
    });
    await expect(
      updateAlbum(setup({ album: null }).ctx, artist, { albumId: "x", title: "n" }),
    ).rejects.toMatchObject({ message: "Album not found" });
  });

  it("deleting an album keeps its songs", async () => {
    const { ctx, db } = setup();
    await deleteAlbum(ctx, artist, "al1");
    expect(db.album.delete).toHaveBeenCalledWith({ where: { id: "al1" } });
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it("lists albums with how many songs are in them", async () => {
    const { ctx, db } = setup();
    db.album.findMany.mockResolvedValue([
      {
        id: "al1",
        slug: "s",
        title: "EP",
        description: null,
        coverUrl: "c",
        createdAt: new Date("2026-10-01"),
        _count: { tracks: 4 },
      },
    ]);
    await expect(listAlbums(ctx, artist)).resolves.toEqual([
      expect.objectContaining({ id: "al1", title: "EP", songCount: 4 }),
    ]);
    expect(db.album.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: "a1" }, orderBy: { createdAt: "desc" } }),
    );
  });
});

describe("getSong", () => {
  it("returns the song with its music details for the edit screen", async () => {
    const { ctx, db } = setup();
    db.item.findFirst.mockResolvedValue({
      id: "i1",
      title: "Gold Hour",
      description: "Single",
      coverUrl: "c",
      supply: null,
      visibility: "PUBLIC",
      royaltyPercent: null,
      type: "TRACK",
      chainType: "CLASSIC_TOKEN",
      classicToken: { code: "GOLDHOUR" },
      contractNft: null,
      media: {
        mediaType: "AUDIO",
        sourceUrl: "https://cdn.example/song.mp3",
        durationSec: 200,
        previewStartSec: 60,
      },
      track: { artistName: "Luna Vale", trackNumber: 2, albumId: "al1" },
      listings: [
        {
          priceBandcoin: { toString: () => "5" },
          priceUsd: { toString: () => "0.1" },
          status: "ACTIVE",
          quantitySold: 0,
        },
      ],
    });
    await expect(getSong(ctx, artist, "i1")).resolves.toMatchObject({
      id: "i1",
      title: "Gold Hour",
      code: "GOLDHOUR",
      locked: false,
      priceBandcoin: "5",
      audioUrl: "https://cdn.example/song.mp3",
      durationSec: 200,
      previewStartSec: 60,
      albumId: "al1",
      trackNumber: 2,
      artistName: "Luna Vale",
    });
  });

  it("only shows the artist's own song", async () => {
    await expect(getSong(setup({ item: null }).ctx, artist, "i1")).rejects.toMatchObject({
      message: "Song not found",
    });
  });
});

describe("listSongs", () => {
  it("lists only songs with their album, plays and sales", async () => {
    const { ctx, db } = setup();
    db.item.findMany.mockResolvedValue([
      {
        id: "i1",
        slug: "s",
        title: "Gold Hour",
        coverUrl: "c",
        visibility: "PUBLIC",
        supply: null,
        playCount: 12,
        createdAt: new Date("2026-10-01"),
        classicToken: { code: "GOLDHOUR" },
        track: { artistName: "Luna Vale", trackNumber: 2, album: { id: "al1", title: "EP" } },
        media: { durationSec: 200, status: "LEGACY" },
        listings: [
          {
            priceBandcoin: { toString: () => "5" },
            priceUsd: { toString: () => "0.1" },
            status: "ACTIVE",
            quantitySold: 3,
          },
        ],
        _count: { stems: 2 },
      },
    ]);
    await expect(listSongs(ctx, artist)).resolves.toEqual([
      expect.objectContaining({
        id: "i1",
        title: "Gold Hour",
        albumTitle: "EP",
        albumId: "al1",
        trackNumber: 2,
        plays: 12,
        sold: 3,
        stems: 2,
        durationSec: 200,
        priceBandcoin: "5",
      }),
    ]);
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: "a1", deletedAt: null, type: "TRACK" } }),
    );
  });
});

describe("music router", () => {
  const caller = (artistRow: Row | null, signedIn = true) =>
    createCallerFactory(portalRouter)(
      createContext({
        db: {
          activityLog: { create: vi.fn() },
          artist: { findUnique: vi.fn().mockResolvedValue(artistRow) },
        } as unknown as Db,
        chain: {} as ChainGateway,
        app: "artist",
        session: signedIn
          ? { user: { id: "u9", role: "FAN", walletAddress: "GW", walletType: "freighter" } }
          : null,
      }),
    );

  it("is for signed-in, approved artists only", async () => {
    await expect(caller(null, false).music.songs()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).music.albums()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ id: "a1", status: "PENDING" }).music.songs()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects an empty album title before touching anything", async () => {
    await expect(
      caller({ id: "a1", status: "APPROVED", slug: "s" }).music.createAlbum({
        title: " ",
        coverUrl: "https://cdn.example/a.jpg",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
