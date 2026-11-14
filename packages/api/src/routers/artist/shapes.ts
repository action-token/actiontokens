import { z } from "zod";

import { shapePathSchema } from "@bandcoin/ar-core/pin-look";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { openaiModel } from "../../services/ai/model";
import { withAiQuota } from "../../services/ai/quota";
import {
  decodeDataUrl,
  enhanceSilhouette,
  fetchReference,
  generateSilhouette,
} from "../../services/ai/silhouette";
import {
  archiveShape,
  createShape,
  deleteShape,
  listShapes,
  shapeUsage,
  updateShape,
} from "../../services/artist/shapes";
import { actingArtistProcedure, createRouter } from "../../trpc";

const shapeFields = {
  name: z.string().trim().min(1, "Give the shape a name").max(40, "Keep the name short"),
  path: shapePathSchema,
  anchor: z.enum(["center", "bottom"]).default("center"),
};
const id = z.object({ id: z.string().min(1) });

/** An artist's own pin shapes and Pin Studio's AI (see services/artist/shapes, services/ai/silhouette). */
export const shapesRouter = createRouter({
  list: actingArtistProcedure
    .input(z.object({ archived: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => listShapes(ctx, ctx.artist, input)),

  usage: actingArtistProcedure
    .input(id)
    .query(({ ctx, input }) => shapeUsage(ctx, ctx.artist, input.id)),

  create: actingArtistProcedure
    .input(z.object(shapeFields))
    .mutation(({ ctx, input }) => createShape(ctx, ctx.artist, input)),

  update: actingArtistProcedure
    .input(
      z
        .object(shapeFields)
        .partial()
        .extend({ id: z.string().min(1) }),
    )
    .mutation(({ ctx, input }) => updateShape(ctx, ctx.artist, input)),

  archive: actingArtistProcedure
    .input(id.extend({ archived: z.boolean().default(true) }))
    .mutation(({ ctx, input }) => archiveShape(ctx, ctx.artist, input)),

  delete: actingArtistProcedure
    .input(id)
    .mutation(({ ctx, input }) => deleteShape(ctx, ctx.artist, input.id)),

  /**
   * Pin Studio's AI: one black silhouette for a description, optionally based on a reference image
   * and/or link. Counts as one AI image (the daily limit, only when it succeeds). The browser
   * traces the result into an outline; nothing is stored here.
   */
  ai: actingArtistProcedure
    .input(
      z.object({
        description: z.string().trim().min(3, "Describe the shape").max(600),
        /** A data URL (PNG / JPG / WebP) the browser made from an uploaded file. */
        referenceImage: z.string().max(12_000_000).optional(),
        referenceUrl: z.url("Paste a full link, starting with https://").max(2000).optional(),
        /** The artist confirms they may use the reference. */
        rights: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hasReference = Boolean(input.referenceImage ?? input.referenceUrl);
      if (hasReference && !input.rights)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "Confirm you can use the reference first.",
        });
      // References are read before the AI runs, so a bad link doesn't use up a generation.
      const references = [
        ...(input.referenceImage ? [decodeDataUrl(input.referenceImage)] : []),
        ...(input.referenceUrl ? [await fetchReference(input.referenceUrl)] : []),
      ];
      const image = await withAiQuota(
        ctx,
        { userId: ctx.session.user.id, unlimited: ctx.session.user.role === "ADMIN" },
        "image",
        () => generateSilhouette(openaiModel, input.description, references),
      );
      return { image };
    }),

  /**
   * Pin Studio's "Enhance with AI": the artist's current outline, redrawn cleaner, more even and
   * more polished (plus an optional instruction). The server draws the outline itself, so only the
   * artist's own drawing is sent. Counts as one AI image (only when it succeeds); the browser
   * traces the result and the artist chooses whether to use it.
   */
  enhance: actingArtistProcedure
    .input(
      z.object({
        path: shapePathSchema,
        instruction: z.string().trim().max(300, "Keep the instruction short").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const image = await withAiQuota(
        ctx,
        { userId: ctx.session.user.id, unlimited: ctx.session.user.role === "ADMIN" },
        "image",
        () => enhanceSilhouette(openaiModel, input.path, input.instruction),
      );
      return { image };
    }),
});
