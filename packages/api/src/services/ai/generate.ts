import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";
import { uploadBufferToS3 } from "@bandcoin/storage";
import { normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";

import type { Context } from "../../context";
import { tagName } from "../artist/pins";
import { FILL_SCHEMAS, type FillForm, type FillResult, FORM_BRIEF } from "./forms";
import type { AiModel, ImageSize } from "./model";
import { withAiQuota } from "./quota";

type GenerateCtx = Pick<Context, "db">;
/** The signed-in artist; the allowance belongs to their account (userId). */
type Artist = { userId: string; name: string; bio: string | null };
type Who = { artist: Artist; unlimited: boolean };

const RULES = `Rules:
- Write in the same language the artist writes in.
- Be specific and vivid, never generic filler; no hashtags or emoji unless the artist used them.
- Never invent URLs, prices, addresses or facts the artist didn't give; use null when unknown.
- Respect every detail the artist gave (dates, numbers, names).`;

export const WRITE_MODES = [
  "write",
  "improve",
  "shorter",
  "longer",
  "fun",
  "professional",
] as const;
export type WriteMode = (typeof WRITE_MODES)[number];

const artistLine = ({ name, bio }: Artist) =>
  `The artist is "${name}"${bio ? `: ${bio.slice(0, 300)}` : ""}.`;

const contextBlock = (context: Record<string, string>) => {
  const lines = Object.entries(context)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `- ${key}: ${value.slice(0, 1500)}`);
  return lines.length > 0
    ? `What's already in the form:\n${lines.join("\n")}`
    : "The form is empty so far.";
};

const who = ({ artist, unlimited }: Who) => ({ userId: artist.userId, unlimited });

/** "Fill with AI": one description becomes every field of a form, for the artist to review. */
export async function fillForm<F extends FillForm>(
  ctx: GenerateCtx,
  model: AiModel,
  actor: Who,
  input: {
    form: F;
    prompt: string;
    now: string;
    timeZone: string;
    context: Record<string, string>;
  },
): Promise<FillResult<F>> {
  const schema = FILL_SCHEMAS[input.form];
  return withAiQuota(ctx, who(actor), "text", async () => {
    const filled = await model.fill({
      system: `You fill in the form for ${FORM_BRIEF[input.form]} on Bandcoin, a platform where artists sell music and collectibles to fans. ${artistLine(actor.artist)}
It is now ${input.now} (${input.timeZone}). Choose sensible defaults for anything the artist didn't specify, and dates in the future.
${RULES}`,
      user: `${contextBlock(input.context)}\n\nWhat the artist wants:\n${input.prompt}`,
      schema,
    });
    if (!filled)
      throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
        message: "The AI didn't return a form. Try rephrasing.",
      });
    return filled as FillResult<F>;
  });
}

const TASKS: Record<WriteMode, (field: string) => string> = {
  write: (field) => `Write the ${field}.`,
  improve: (field) =>
    `Improve this ${field}: clearer, tighter, better flow. Keep its meaning and facts.`,
  shorter: (field) => `Make this ${field} noticeably shorter. Keep the key facts.`,
  longer: (field) => `Expand this ${field} with more useful, specific detail (no invented facts).`,
  fun: (field) => `Rewrite this ${field} to be more playful and exciting.`,
  professional: (field) => `Rewrite this ${field} to sound polished and professional.`,
};

/** Write or rework one field, using the rest of the form as context. */
export async function writeField(
  ctx: GenerateCtx,
  model: AiModel,
  actor: Who,
  input: {
    form: FillForm;
    field: string;
    mode: WriteMode;
    current: string;
    maxChars?: number;
    context: Record<string, string>;
  },
) {
  return withAiQuota(ctx, who(actor), "text", async () => {
    const raw = await model.write({
      system: `You write copy for ${FORM_BRIEF[input.form]} on Bandcoin. ${artistLine(actor.artist)}
${RULES}
Return plain text only, no quotes, no markdown.${input.maxChars ? ` Stay under ${input.maxChars} characters.` : ""} Return only the ${input.field} itself.`,
      user: `${contextBlock(input.context)}\n\n${TASKS[input.mode](input.field)}${input.current.trim() ? `\n\nCurrent ${input.field}:\n${input.current}` : ""}`,
    });
    let text = raw
      .trim()
      .replace(/^```\w*\s*|\s*```$/g, "")
      .replace(/^["“](.*)["”]$/s, "$1");
    if (input.maxChars) text = text.slice(0, input.maxChars);
    if (!text)
      throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
        message: "The AI came back empty. Try again.",
      });
    return { text };
  });
}

const SIZES: Record<"square" | "wide" | "portrait", ImageSize> = {
  square: "1024x1024",
  wide: "1536x1024",
  portrait: "1024x1536",
};

/** Generate an image and store it with the artist's other uploads. */
export async function generateImage(
  ctx: GenerateCtx,
  model: AiModel,
  actor: Who,
  input: { form: FillForm; prompt: string; aspect: keyof typeof SIZES },
) {
  return withAiQuota(ctx, who(actor), "image", async () => {
    const bytes = await model.image({
      prompt: `${input.prompt}\n\nFor ${FORM_BRIEF[input.form]}. High quality, eye-catching, no words, letters, logos or watermarks.`,
      size: SIZES[input.aspect],
    });
    if (!bytes)
      throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
        message: "No image came back. Try again.",
      });
    return { url: await uploadBufferToS3(bytes, "image/png") };
  });
}

const TAG_COUNT = 7;
const tagSchema = z.object({
  tags: z
    .array(z.string())
    .describe(
      `Exactly ${TAG_COUNT} search tags, most useful first: the artist or series, the kind of thing, the theme, then the place`,
    ),
});

/**
 * Search tags for a pin. The same title and place give the same tags, so a
 * repeat is answered from the cache and costs no allowance.
 */
export async function suggestPinTags(
  ctx: GenerateCtx,
  model: AiModel,
  actor: Who,
  input: { title: string; description: string; type: string; place: string },
) {
  const key = `${tagName(input.title)}|${tagName(input.place)}`;
  const cached = await ctx.db.pinTagCache.findUnique({
    where: { title: key },
    select: { tags: true },
  });
  if (cached) return { tags: cached.tags };

  return withAiQuota(ctx, who(actor), "text", async () => {
    const filled = await model.fill({
      system: `You write search tags for a pin on a music map. ${artistLine(actor.artist)}
Tags are short lowercase phrases of 1-3 words that fans would search for. No hashtags, no duplicates, nothing the artist didn't hint at.`,
      user: `Title: ${input.title}\nType: ${input.type}\nPlace: ${input.place.trim() || "unknown"}\nDescription: ${input.description.trim().slice(0, 600) || "none"}`,
      schema: tagSchema,
    });
    const tags = [
      ...new Set(
        (filled?.tags ?? [])
          .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
          .filter((tag) => tag.length > 0 && tag.length <= 40),
      ),
    ].slice(0, TAG_COUNT);
    if (tags.length === 0)
      throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
        message: "The AI didn't suggest any tags. Try again.",
      });
    await ctx.db.pinTagCache.upsert({
      where: { title: key },
      create: { title: key, tags },
      update: { tags },
    });
    return { tags };
  });
}

const codeSchema = z.object({
  codes: z
    .array(z.string())
    .describe(
      "Exactly 3 fan token codes: 4-12 capital letters or digits, no spaces, short and memorable",
    ),
});

/** Three fan token codes that fit the artist's name, checked against the code rules. */
export async function suggestTokenCodes(
  ctx: GenerateCtx,
  model: AiModel,
  actor: Who,
  input: { name: string; bio: string },
) {
  return withAiQuota(ctx, who(actor), "text", async () => {
    const filled = await model.fill({
      system: `You suggest the code of a music artist's fan token on Stellar. Fans hold it to join the artist's memberships.
Codes are 4-12 capital letters or digits, easy to say, clearly tied to the artist (a short form of the name, a nickname, or name + FANS / CLUB / CREW). Never BANDCOIN, XLM, USDC or USD.`,
      user: `Artist: ${input.name}\nAbout: ${input.bio.trim().slice(0, 500) || "nothing yet"}`,
      schema: codeSchema,
    });
    const codes = [
      ...new Set(
        (filled?.codes ?? [])
          .map((code) => normalizeAssetCode(code).replace(/[^A-Z0-9]/g, ""))
          .filter((code) => code.length >= 4 && !validateAssetCode(code)),
      ),
    ].slice(0, 3);
    if (codes.length === 0)
      throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
        message: "The AI didn't come up with a code. Try again.",
      });
    return { codes };
  });
}
