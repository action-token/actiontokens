import { z } from "zod";

/**
 * What "Fill with AI" returns for each form. Structured outputs need every key
 * present, so anything the artist might not want is nullable and the form only
 * applies the non-null values. Dates are the artist's local wall-clock
 * "YYYY-MM-DDTHH:mm" (what datetime-local inputs use).
 */
const localDateTime = z.string().nullable().describe('Local date-time "YYYY-MM-DDTHH:mm" in the artist\'s timezone, or null');
const imagePrompt = z.string().describe("A short visual brief for a cover image that fits this: subject, mood, style. No text in the image.");

export const FILL_SCHEMAS = {
  event: z.object({
    title: z.string().describe("Max 100 chars"),
    description: z.string().describe("Plain text, 60-200 words: what's happening, who it's for, what to bring"),
    startsAt: localDateTime,
    endsAt: localDateTime,
    inPerson: z.boolean(),
    venueName: z.string().nullable(),
    address: z.string().nullable(),
    link: z.string().nullable().describe("Only a URL the artist gave"),
    linkLabel: z.string().nullable().describe("Button text, max 30"),
    capacity: z.number().int().min(1).nullable(),
    imagePrompt,
  }),
  announcement: z.object({
    title: z.string().describe("Max 100 chars"),
    body: z.string().describe("Plain text, 40-150 words, line breaks allowed"),
    ctaLabel: z.string().nullable().describe("Button text (max 30) if a link makes sense"),
    ctaUrl: z.string().nullable().describe("Only a URL the artist gave"),
    imagePrompt,
  }),
  bounty: z.object({
    title: z.string().describe("Catchy and specific, max 120 chars"),
    summary: z.string().describe("A one-liner for cards, max 600 chars"),
    description: z.string().describe("Markdown with sections: Overview, Goals, Evaluation criteria, Deliverables. Max 2500 chars"),
    prizeAmount: z.number().min(1).nullable().describe("Only if the artist gave a prize"),
    maxWinners: z.number().int().min(1).max(10),
    rewardNote: z.string().nullable().describe("How and when the reward is delivered, max 300 chars"),
    instructions: z.array(z.string()).describe("3 to 6 short strings (each max 200 chars) saying what fans must submit"),
    imagePrompt,
  }),
  item: z.object({
    title: z.string().describe("Collectible name, max 60 chars"),
    description: z.string().describe("2-4 sentences on what buyers get"),
    code: z.string().describe("On-chain asset code: 4-12 letters A-Z only, uppercase, derived from the name"),
    supply: z.number().int().min(1).nullable().describe("How many copies, or null for unlimited"),
    priceBandcoin: z.number().min(0).nullable().describe("Only if the artist gave a price"),
    priceUsd: z.number().min(0).nullable().describe("Only if the artist gave a price"),
    imagePrompt,
  }),
  tier: z.object({
    name: z.string().describe("Tier name, max 40 chars"),
    description: z.string().describe("One sentence, max 200 chars"),
    features: z.array(z.string()).max(6).describe("Up to 6 short perks, max 60 chars each"),
    isPopular: z.boolean(),
  }),
  album: z.object({
    title: z.string().describe("Album title, max 80 chars"),
    description: z.string().describe("2-4 sentences about the album for fans"),
    imagePrompt,
  }),
  song: z.object({
    title: z.string().describe("Song title, max 80 chars"),
    description: z.string().describe("1-3 sentences about the song for fans"),
    creditedName: z.string().nullable().describe("Only if the artist named collaborators"),
    imagePrompt,
  }),
} as const;

export type FillForm = keyof typeof FILL_SCHEMAS;
export type FillResult<F extends FillForm> = z.infer<(typeof FILL_SCHEMAS)[F]>;
export const FILL_FORMS = Object.keys(FILL_SCHEMAS) as [FillForm, ...FillForm[]];

/** What each form is, for the model's instructions. */
export const FORM_BRIEF: Record<FillForm, string> = {
  event: "an event fans can RSVP to (a gig, signing or listening party)",
  announcement: "a short announcement in the artist's news feed",
  bounty: "a bounty: a public challenge with a token prize for the best submissions",
  item: "a collectible the artist sells to fans",
  tier: "a membership tier fans unlock by holding the artist's fan token",
  album: "an album that groups the artist's songs",
  song: "a song the artist releases",
};
