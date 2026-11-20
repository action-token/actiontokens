import { z } from "zod";

import { FILL_FORMS } from "../../services/ai/forms";
import {
  fillForm,
  generateImage,
  suggestPinTags,
  suggestTokenCodes,
  WRITE_MODES,
  writeField,
} from "../../services/ai/generate";
import { openaiModel } from "../../services/ai/model";
import { aiRemaining } from "../../services/ai/quota";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { artistProcedure, authedProcedure, createRouter } from "../../trpc";

const form = z.enum(FILL_FORMS);
const context = z.record(z.string(), z.string().max(4000)).default({});

/**
 * Anyone signed in who isn't banned: artists, and people filling in the
 * onboarding wizard (who may have no artist page yet). Same daily allowance,
 * counted per account. The AI is told the artist's name from their page, or
 * from the wizard's `context.name` before there is one.
 */
const aiUserProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const artist = await ctx.db.artist.findUnique({
    where: { userId: ctx.session.user.id },
    select: { name: true, bio: true, status: true },
  });
  if (artist?.status === "BANNED") throw new AppError(ErrorCodes.AUTH_FORBIDDEN);
  return next({
    ctx: {
      aiActor: {
        userId: ctx.session.user.id,
        name: artist?.name ?? null,
        bio: artist?.bio ?? null,
      },
      unlimited: ctx.session.user.role === "ADMIN",
    },
  });
});

/** The artist as the AI should see them: the page's name, or what they typed in the wizard. */
const actorOf = (
  aiActor: { userId: string; name: string | null; bio: string | null },
  context: Record<string, string>,
) => ({
  userId: aiActor.userId,
  name: context.name?.trim() || aiActor.name || "a new artist",
  bio: context.bio?.trim() || aiActor.bio,
});

/** AI help on the create pages and the onboarding wizard (see services/ai): fill a form, write a field, make an image. */
export const aiRouter = createRouter({
  /** Today's remaining generations. */
  usage: aiUserProcedure.query(({ ctx }) =>
    aiRemaining(ctx, { userId: ctx.session.user.id, unlimited: ctx.unlimited }),
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

  writeField: aiUserProcedure
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
        { artist: actorOf(ctx.aiActor, input.context), unlimited: ctx.unlimited },
        input,
      ),
    ),

  generateImage: aiUserProcedure
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
        { artist: actorOf(ctx.aiActor, {}), unlimited: ctx.unlimited },
        input,
      ),
    ),

  /** Three fan token codes for the onboarding wizard. */
  suggestTokenCodes: aiUserProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "Add your name first").max(60),
        bio: z.string().max(500).default(""),
      }),
    )
    .mutation(({ ctx, input }) =>
      suggestTokenCodes(
        ctx,
        openaiModel,
        { artist: actorOf(ctx.aiActor, input), unlimited: ctx.unlimited },
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
