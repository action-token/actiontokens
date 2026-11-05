import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { GenerateProvider } from "./google";
import { defaultModel } from "./models";

/**
 * Enhance prompt: a text model rewrites what the person typed into a clearer,
 * more detailed prompt for the tool, and nothing is generated. It's free (the
 * owner's choice, 2026-11-05): the platform pays the small text cost, so the
 * input and the answer are kept short.
 */
export const MAX_ENHANCE_PROMPT = 600;

const BRIEF: Record<"IMAGE" | "VIDEO" | "TEXT" | "MUSIC", string> = {
  IMAGE:
    "an image generator: describe the subject, setting, lighting, colours, composition and style in one paragraph",
  VIDEO:
    "a short video generator: describe the scene, camera movement, mood, lighting and sound in one paragraph",
  TEXT: "a writing assistant: say what to write, for whom, in what tone and how long",
  MUSIC:
    "a music generator: describe the genre, mood, tempo, instruments and vocals in one or two sentences",
};

export async function enhancePrompt(
  input: { tool: keyof typeof BRIEF; prompt: string },
  write: GenerateProvider["write"],
) {
  const prompt = input.prompt.trim();
  if (prompt.length < 3 || prompt.length > MAX_ENHANCE_PROMPT)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Write between 3 and ${MAX_ENHANCE_PROMPT} characters first.`,
    });
  const { text } = await write({
    model: defaultModel("TEXT").id,
    prompt: [
      `Rewrite this into a better prompt for ${BRIEF[input.tool]}.`,
      "Keep the person's idea and language. Answer with the prompt only, no quotes or notes, under 120 words.",
      "",
      prompt,
    ].join("\n"),
  });
  return { prompt: text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 2000) };
}
