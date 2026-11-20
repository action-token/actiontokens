import { z } from "zod";

import { listGalleries, loadGallery, toggleLike } from "../../services/gallery";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";
import { SLOT_ID, ROOM_INDEX } from "../artist/gallery";

/** The 3D gallery as fans see it: every approved artist's museum, and liking what hangs in it. */
export const galleryRouter = createRouter({
  /** The entrance: who has a museum. */
  list: publicProcedure.query(({ ctx }) => listGalleries(ctx)),

  /** One museum by artist id or slug: frames, rooms, music, and likes per frame (with the viewer's own). */
  byArtist: publicProcedure
    .input(z.object({ artist: z.string().min(1) }))
    .query(({ ctx, input }) => loadGallery(ctx, input.artist, ctx.session?.user.id)),

  like: authedProcedure
    .input(z.object({ organizationId: z.string().min(1), slotId: SLOT_ID, roomIndex: ROOM_INDEX }))
    .mutation(({ ctx, input }) => toggleLike(ctx, ctx.session.user.id, input)),
});
