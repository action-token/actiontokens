import { z } from "zod";

import {
  BIO_MAX,
  getProfile,
  NAME_MAX,
  setProfileImage,
  updateProfile,
} from "../../services/artist/profile";
import { artistProcedure, createRouter } from "../../trpc";

/** The artist's own profile, as the Settings page shows and edits it. */
export const profileRouter = createRouter({
  overview: artistProcedure.query(({ ctx }) => getProfile(ctx, ctx.artist)),

  update: artistProcedure
    .input(
      z.object({
        name: z.string().max(NAME_MAX + 20),
        bio: z.string().max(BIO_MAX + 20),
        website: z.string().max(300),
        twitter: z.string().max(120),
        instagram: z.string().max(120),
      }),
    )
    .mutation(({ ctx, input }) => updateProfile(ctx, ctx.artist, input)),

  setImage: artistProcedure
    .input(
      z.object({ kind: z.enum(["avatar", "cover"]), url: z.string().url().max(2048).nullable() }),
    )
    .mutation(({ ctx, input }) => setProfileImage(ctx, ctx.artist, input)),
});
