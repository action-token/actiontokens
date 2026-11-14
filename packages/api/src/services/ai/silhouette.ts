import { AppError, ErrorCodes } from "@bandcoin/errors";
import { fetchPublicFile, renderOutlinePng } from "@bandcoin/storage";

import type { AiModel } from "./model";

/**
 * AI pin silhouettes for Pin Studio (plan 43): a description, and optionally a reference image or
 * link, in; one black silhouette image out. The browser traces it into an editable outline, so
 * the image itself is never stored.
 */

/** Images the model takes as a reference. */
const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type RefType = (typeof REFERENCE_TYPES)[number];
export type Reference = { bytes: Buffer; type: RefType };
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

const refuse = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

const asRefType = (contentType: string): RefType | null => {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  return (REFERENCE_TYPES as readonly string[]).includes(type) ? (type as RefType) : null;
};

/** `data:image/png;base64,…` from the browser → bytes and type. */
export function decodeDataUrl(dataUrl: string): Reference {
  const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const type = match ? asRefType(match[1]!) : null;
  if (!match || !type) throw refuse("The reference image must be a PNG, JPG or WebP.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > MAX_REFERENCE_BYTES) throw refuse("The reference image is over 8 MB.");
  return { bytes, type };
}

/** The preview image a web page declares (Open Graph / Twitter card), resolved against the page. */
export function pagePreviewImage(html: string, pageUrl: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    for (const tag of tags) {
      const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (name === key && content) {
        try {
          return new URL(content.replace(/&amp;/g, "&"), pageUrl).toString();
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * A reference link → image bytes. An image link is used as it is; a web page is used through its
 * preview image. Fetched only through the public-URL guard (no private addresses, size-capped,
 * redirects checked).
 */
export async function fetchReference(url: string): Promise<Reference> {
  let file: { bytes: Buffer; contentType: string };
  try {
    file = await fetchPublicFile(url, { maxBytes: MAX_REFERENCE_BYTES });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw refuse("That link couldn't be opened.");
  }
  const direct = asRefType(file.contentType);
  if (direct) return { bytes: file.bytes, type: direct };
  if (file.contentType.toLowerCase().includes("text/html")) {
    const preview = pagePreviewImage(file.bytes.toString("utf8"), url);
    if (preview) {
      const image = await fetchPublicFile(preview, { maxBytes: MAX_REFERENCE_BYTES }).catch(
        () => null,
      );
      const type = image ? asRefType(image.contentType) : null;
      if (image && type) return { bytes: image.bytes, type };
    }
    throw refuse("That page has no preview image to use. Link to an image instead.");
  }
  throw refuse("That link isn't an image (PNG, JPG or WebP) or a web page.");
}

const SOLID =
  "Draw it as ONE solid black filled shape on a plain white background, centred and filling most of the square. One connected outline. No holes, no inner lines or details, no text, no shadows, no gradients, no border.";

/** What the model is asked for: one filled shape a pin can use, never a copy of someone's work. */
export function silhouettePrompt(description: string, hasReference: boolean) {
  return [
    `A pin icon silhouette: ${description.trim()}.`,
    hasReference
      ? "Base the silhouette on the overall shape of the reference image."
      : "An original design, not a copy of any existing character, mascot, logo or artwork.",
    SOLID,
  ].join(" ");
}

/**
 * What the model is asked when it redraws an artist's own outline ("Enhance with AI"): the same
 * subject, cleaned up, evened out and polished, plus the artist's own instruction if they gave one.
 */
export function enhancePrompt(instruction?: string) {
  const extra = instruction?.trim();
  return [
    "The image is a rough pin icon silhouette someone drew by hand.",
    "Redraw it as a clean, polished, professional icon silhouette of the same subject:",
    "keep its pose and overall proportions, smooth out wobbly or uneven edges and curves,",
    "and make the left and right sides match wherever the drawing looks meant to be symmetrical.",
    extra ? `Also: ${extra}.` : "",
    SOLID,
  ]
    .filter(Boolean)
    .join(" ");
}

const asDataUrl = (bytes: Buffer | null) => {
  if (!bytes)
    throw new AppError(ErrorCodes.AI_GENERATION_FAILED, {
      message: "No image came back. Try again.",
    });
  return `data:image/png;base64,${bytes.toString("base64")}`;
};

/** One silhouette image (a PNG data URL) for the description and references. */
export async function generateSilhouette(
  model: AiModel,
  description: string,
  references: Reference[],
): Promise<string> {
  const prompt = silhouettePrompt(description, references.length > 0);
  return asDataUrl(
    references.length > 0
      ? await model.edit({ prompt, images: references })
      : await model.image({ prompt, size: "1024x1024", quality: "low" }),
  );
}

/** An artist's outline (a validated path), redrawn by the AI; returns a PNG data URL. */
export async function enhanceSilhouette(
  model: AiModel,
  path: string,
  instruction?: string,
): Promise<string> {
  const drawing = await renderOutlinePng(path);
  return asDataUrl(
    await model.edit({
      prompt: enhancePrompt(instruction),
      images: [{ bytes: drawing, type: "image/png" }],
    }),
  );
}
