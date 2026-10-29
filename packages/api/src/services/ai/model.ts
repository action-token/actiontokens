import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

/** Models are overridable per environment. */
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";

export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

/** The three things the portal asks an AI for. Tests pass a fake. */
export type AiModel = {
  /** A form filled in as structured data; null when the model returned nothing usable. */
  fill: <S extends z.ZodType>(input: { system: string; user: string; schema: S }) => Promise<z.infer<S> | null>;
  write: (input: { system: string; user: string }) => Promise<string>;
  /** PNG bytes, or null when no image came back. */
  image: (input: { prompt: string; size: ImageSize }) => Promise<Buffer | null>;
};

let client: OpenAI | undefined;
const openai = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "AI help isn't switched on yet.", details: { name: "OPENAI_API_KEY" } });
  return (client ??= new OpenAI({ apiKey }));
};

export const openaiModel: AiModel = {
  async fill({ system, user, schema }) {
    const res = await openai().responses.parse({
      model: TEXT_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: zodTextFormat(schema, "form") },
    });
    return (res.output_parsed as z.infer<typeof schema> | null) ?? null;
  },
  async write({ system, user }) {
    const res = await openai().responses.create({
      model: TEXT_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.output_text;
  },
  async image({ prompt, size }) {
    const res = await openai().images.generate({ model: IMAGE_MODEL, prompt, size, quality: "medium", n: 1 });
    const b64 = res.data?.[0]?.b64_json;
    return b64 ? Buffer.from(b64, "base64") : null;
  },
};

/** What to tell the artist when the provider refuses or is busy. */
export function friendlyProviderError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 400 && /safety|moderation|policy/i.test(error.message)) return "That was blocked by the AI's safety filter. Try wording it differently.";
    if (error.status === 429) return "The AI is busy right now. Try again in a moment.";
  }
  return "The AI couldn't finish that. Try again.";
}
