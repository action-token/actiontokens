import { z } from "zod";

import { FILL_FORMS } from "../../services/ai/forms";
import {
  fillForm,
  generateImage,
  suggestPinTags,
  WRITE_MODES,
  writeField,
} from "../../services/ai/generate";
import { openaiModel } from "../../services/ai/model";
import { aiRemaining } from "../../services/ai/quota";
import { artistProcedure, createRouter } from "../../trpc";

const form = z.enum(FILL_FORMS);
const context = z.record(z.string(), z.string().max(4000)).default({});

/** AI help on the create pages (see services/ai): fill a form, write a field, make a cover. */
export const aiRouter = createRouter({
  /** Today's remaining generations. */
  usage: artistProcedure.query(({ ctx }) =>
    aiRemaining(ctx, { artistId: ctx.artist.id, unlimited: ctx.session.user.role === "ADMIN" }),
  ),

  fillForm: artistProcedure
    .input(
      z.object({
        form,
        prompt: z.string().trim().min(3, "Describe what you want to create").max(2000),
        now: z.string().max(40).describe("The artist's local date-time"),
        timeZone: z.string().max(64),
        context,
      }),
    )
    .mutation(({ ctx, input }) =>
      fillForm(
        ctx,
        openaiModel,
        { artist: ctx.artist, unlimited: ctx.session.user.role === "ADMIN" },
        input,
      ),
    ),

  writeField: artistProcedure
    .input(
      z.object({
        form,
        field: z.string().max(60),
        mode: z.enum(WRITE_MODES),
        current: z.string().max(8000).default(""),
        maxChars: z.number().int().min(10).max(5000).optional(),
        context,
      }),
    )
    .mutation(({ ctx, input }) =>
      writeField(
        ctx,
        openaiModel,
        { artist: ctx.artist, unlimited: ctx.session.user.role === "ADMIN" },
        input,
      ),
    ),

  generateImage: artistProcedure
    .input(
      z.object({
        form,
        prompt: z.string().trim().min(3, "Describe the image").max(1500),
        aspect: z.enum(["square", "wide", "portrait"]).default("wide"),
      }),
    )
    .mutation(({ ctx, input }) =>
      generateImage(
        ctx,
        openaiModel,
        { artist: ctx.artist, unlimited: ctx.session.user.role === "ADMIN" },
        input,
      ),
    ),

  suggestPinTags: artistProcedure
    .input(
      z.object({
        title: z.string().trim().min(3, "Give the pin a title first").max(120),
        description: z.string().max(2000).default(""),
        type: z.string().max(20),
        place: z.string().max(240).default(""),
      }),
    )
    .mutation(({ ctx, input }) =>
      suggestPinTags(
        ctx,
        openaiModel,
        { artist: ctx.artist, unlimited: ctx.session.user.role === "ADMIN" },
        input,
      ),
    ),
});
