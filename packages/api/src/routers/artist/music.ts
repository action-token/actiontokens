import { z } from "zod";

import { createAlbum, createSong, deleteAlbum, getSong, listAlbums, listSongs, updateAlbum, updateSong } from "../../services/artist/music";
import { artistProcedure, createRouter } from "../../trpc";

const price = z.string().trim().max(20);

/** The artist's songs and albums (see services/artist/music). Approved artists only. */
export const musicRouter = createRouter({
  songs: artistProcedure.query(({ ctx }) => listSongs(ctx, ctx.artist)),

  song: artistProcedure.input(z.object({ itemId: z.string().min(1) })).query(({ ctx, input }) => getSong(ctx, ctx.artist, input.itemId)),

  createSong: artistProcedure
    .input(
      z.object({
        title: z.string().trim().min(1, "Give it a title").max(120),
        description: z.string().trim().max(2000).optional(),
        coverUrl: z.string().url(),
        audio: z.object({ url: z.string().url(), durationSec: z.number().int() }),
        previewStartSec: z.number().int(),
        code: z.string().trim().max(12),
        supply: z.number().int().nullable(),
        priceBandcoin: price,
        priceUsd: price,
        visibility: z.enum(["DRAFT", "PUBLIC"]),
        albumId: z.string().min(1).optional(),
        trackNumber: z.number().int().min(1).max(999).optional(),
        artistName: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(({ ctx, input }) => createSong(ctx, ctx.artist, ctx.session.user, input)),

  /** The music-only details; title, price, supply and visibility go through catalog.update. */
  updateSong: artistProcedure
    .input(
      z.object({
        itemId: z.string().min(1),
        albumId: z.string().min(1).nullable().optional(),
        trackNumber: z.number().int().min(1).max(999).nullable().optional(),
        artistName: z.string().trim().min(1).max(120).optional(),
        previewStartSec: z.number().int().optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateSong(ctx, ctx.artist, input)),

  albums: artistProcedure.query(({ ctx }) => listAlbums(ctx, ctx.artist)),

  createAlbum: artistProcedure
    .input(z.object({ title: z.string().trim().min(1, "Give it a title").max(120), description: z.string().trim().max(2000).optional(), coverUrl: z.string().url() }))
    .mutation(({ ctx, input }) => createAlbum(ctx, ctx.artist, input)),

  updateAlbum: artistProcedure
    .input(z.object({ albumId: z.string().min(1), title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(2000).optional(), coverUrl: z.string().url().optional() }))
    .mutation(({ ctx, input }) => updateAlbum(ctx, ctx.artist, input)),

  removeAlbum: artistProcedure.input(z.object({ albumId: z.string().min(1) })).mutation(({ ctx, input }) => deleteAlbum(ctx, ctx.artist, input.albumId)),
});
