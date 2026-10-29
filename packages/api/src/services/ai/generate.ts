import { AppError, ErrorCodes } from "@bandcoin/errors";
import { uploadBufferToS3 } from "@bandcoin/storage";

import type { Context } from "../../context";
import { FILL_SCHEMAS, type FillForm, type FillResult, FORM_BRIEF } from "./forms";
import type { AiModel, ImageSize } from "./model";
import { withAiQuota } from "./quota";

type GenerateCtx = Pick<Context, "db">;
/** The signed-in artist the allowance belongs to. */
type Artist = { id: string; name: string; bio: string | null };
type Who = { artist: Artist; unlimited: boolean };

const RULES = `Rules:
- Write in the same language the artist writes in.
- Be specific and vivid, never generic filler; no hashtags or emoji unless the artist used them.
- Never invent URLs, prices, addresses or facts the artist didn't give; use null when unknown.
- Respect every detail the artist gave (dates, numbers, names).`;

export const WRITE_MODES = ["write", "improve", "shorter", "longer", "fun", "professional"] as const;
export type WriteMode = (typeof WRITE_MODES)[number];

const artistLine = ({ name, bio }: Artist) => `The artist is "${name}"${bio ? `: ${bio.slice(0, 300)}` : ""}.`;

const contextBlock = (context: Record<string, string>) => {
  const lines = Object.entries(context)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `- ${key}: ${value.slice(0, 1500)}`);
  return lines.length > 0 ? `What's already in the form:\n${lines.join("\n")}` : "The form is empty so far.";
};

const who = ({ artist, unlimited }: Who) => ({ artistId: artist.id, unlimited });

/** "Fill with AI": one description becomes every field of a form, for the artist to review. */
export async function fillForm<F extends FillForm>(
  ctx: GenerateCtx,
  model: AiModel,
  actor: Who,
  input: { form: F; prompt: string; now: string; timeZone: string; context: Record<string, string> },
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
    if (!filled) throw new AppError(ErrorCodes.AI_GENERATION_FAILED, { message: "The AI didn't return a form. Try rephrasing." });
    return filled as FillResult<F>;
  });
}

const TASKS: Record<WriteMode, (field: string) => string> = {
  write: (field) => `Write the ${field}.`,
  improve: (field) => `Improve this ${field}: clearer, tighter, better flow. Keep its meaning and facts.`,
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
  input: { form: FillForm; field: string; mode: WriteMode; current: string; maxChars?: number; context: Record<string, string> },
) {
  return withAiQuota(ctx, who(actor), "text", async () => {
    const raw = await model.write({
      system: `You write copy for ${FORM_BRIEF[input.form]} on Bandcoin. ${artistLine(actor.artist)}
${RULES}
Return plain text only, no quotes, no markdown.${input.maxChars ? ` Stay under ${input.maxChars} characters.` : ""} Return only the ${input.field} itself.`,
      user: `${contextBlock(input.context)}\n\n${TASKS[input.mode](input.field)}${input.current.trim() ? `\n\nCurrent ${input.field}:\n${input.current}` : ""}`,
    });
    let text = raw.trim().replace(/^```\w*\s*|\s*```$/g, "").replace(/^["“](.*)["”]$/s, "$1");
    if (input.maxChars) text = text.slice(0, input.maxChars);
    if (!text) throw new AppError(ErrorCodes.AI_GENERATION_FAILED, { message: "The AI came back empty. Try again." });
    return { text };
  });
}

const SIZES: Record<"square" | "wide" | "portrait", ImageSize> = { square: "1024x1024", wide: "1536x1024", portrait: "1024x1536" };

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
    if (!bytes) throw new AppError(ErrorCodes.AI_GENERATION_FAILED, { message: "No image came back. Try again." });
    return { url: await uploadBufferToS3(bytes, "image/png") };
  });
}
