import { type Block, type BlockType, normalizeBlocks } from "@bandcoin/page/blocks";
import { DEFAULT_TEMPLATE_KEY, TEMPLATES, blocksOf, templateByKey } from "@bandcoin/page/templates";
import { DEFAULT_THEME, type PageTheme, themeSchema } from "@bandcoin/page/theme";
import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

import type { Context } from "../../context";
import { invalid } from "./items";

/**
 * The artist's public page, built from blocks (see @bandcoin/page). Each artist
 * has one layout with two copies: the draft they edit (autosaved) and the
 * published page visitors see. Publishing copies the draft over, theme
 * included, so a half-finished edit never reaches visitors.
 *
 * Storage: `draftBlocks` and `theme` hold the draft; `publishedBlocks` holds
 * `{ blocks, theme }` so the live theme can't change before publishing.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; slug: string };

export type Design = { blocks: Block[]; theme: PageTheme };

/** Blocks are plain JSON, but their settings are typed loosely, so Prisma needs telling. */
const json = (value: unknown) => value as Prisma.InputJsonValue;
const newUid = () => `b-${crypto.randomUUID().slice(0, 8)}`;
const themeOf = (raw: unknown): PageTheme => {
  const parsed = themeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_THEME;
};

/** A saved published page: `{ blocks, theme }`, or just an array of blocks. Anything else is an empty page. */
export function readDesign(raw: unknown): Design {
  if (Array.isArray(raw)) return { blocks: normalizeBlocks(raw, newUid), theme: DEFAULT_THEME };
  if (raw && typeof raw === "object") {
    const value = raw as { blocks?: unknown; theme?: unknown };
    return { blocks: normalizeBlocks(value.blocks, newUid), theme: themeOf(value.theme) };
  }
  return { blocks: normalizeBlocks([], newUid), theme: DEFAULT_THEME };
}

/** The page visitors see, or null when the artist hasn't published one (the fan app then shows its standard page). */
export async function publishedDesign(
  ctx: Pick<ServiceCtx, "db">,
  artistId: string,
): Promise<Design | null> {
  const layout = await ctx.db.pageLayout.findFirst({
    where: { artistId, isActive: true, status: "PUBLISHED" },
    select: { publishedBlocks: true },
  });
  return layout?.publishedBlocks ? readDesign(layout.publishedBlocks) : null;
}

const sameDesign = (a: Design, b: Design) => JSON.stringify(a) === JSON.stringify(b);

async function ensureLayout(ctx: ServiceCtx, artist: ArtistRef) {
  const existing = await ctx.db.pageLayout.findFirst({
    where: { artistId: artist.id },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  const template = templateByKey(DEFAULT_TEMPLATE_KEY) ?? TEMPLATES[0]!;
  return ctx.db.pageLayout.create({
    data: {
      artistId: artist.id,
      name: "My page",
      templateKey: template.key,
      theme: template.theme,
      draftBlocks: json(blocksOf(template, newUid)),
      status: "DRAFT",
      isActive: false,
    },
  });
}

export async function getEditor(ctx: ServiceCtx, artist: ArtistRef) {
  const layout = await ensureLayout(ctx, artist);
  const draft: Design = {
    blocks: normalizeBlocks(layout.draftBlocks, newUid),
    theme: themeOf(layout.theme),
  };
  const published = layout.publishedBlocks ? readDesign(layout.publishedBlocks) : null;
  return {
    layoutId: layout.id,
    slug: artist.slug,
    templateKey: layout.templateKey,
    blocks: draft.blocks,
    theme: draft.theme,
    isPublished: layout.status === "PUBLISHED",
    publishedAt: layout.publishedAt,
    /** The draft differs from what visitors see */
    hasUnpublishedChanges: !published || !sameDesign(draft, published),
    templates: TEMPLATES.map(({ key, name, description }) => ({ key, name, description })),
  };
}

/** Images the artist uploaded (band member photos) must live in our own storage. */
function checkImages(blocks: Block[]) {
  for (const block of blocks) {
    if (block.type !== ("band-members" satisfies BlockType)) continue;
    const members = (block.settings.members ?? []) as { photoUrl?: string }[];
    if (members.some((member) => member.photoUrl && !isOwnS3Url(member.photoUrl)))
      throw invalid("Upload the photos again.");
  }
}

export async function saveDraft(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { blocks: unknown; theme: unknown },
) {
  const theme = themeSchema.safeParse(input.theme);
  if (!theme.success) throw invalid("Pick a valid accent colour and style.");
  const blocks = normalizeBlocks(input.blocks, newUid);
  checkImages(blocks);
  const layout = await ensureLayout(ctx, artist);
  ctx.activity.set({ targetType: "PageLayout", targetId: layout.id });
  await ctx.db.pageLayout.update({
    where: { id: layout.id },
    data: { draftBlocks: json(blocks), theme: theme.data },
  });
  return { layoutId: layout.id, savedAt: new Date() };
}

/** Visitors see the draft as it is now, from this moment. */
export async function publishPage(ctx: ServiceCtx, artist: ArtistRef) {
  const layout = await ensureLayout(ctx, artist);
  ctx.activity.set({ targetType: "PageLayout", targetId: layout.id });
  const design: Design = {
    blocks: normalizeBlocks(layout.draftBlocks, newUid),
    theme: themeOf(layout.theme),
  };
  const publishedAt = new Date();
  await ctx.db.pageLayout.update({
    where: { id: layout.id },
    data: { publishedBlocks: json(design), status: "PUBLISHED", isActive: true, publishedAt },
  });
  return { layoutId: layout.id, publishedAt };
}

/** Throws away the unpublished edits: back to what visitors see, or to the starter page when nothing was published. */
export async function discardDraft(ctx: ServiceCtx, artist: ArtistRef) {
  const layout = await ensureLayout(ctx, artist);
  ctx.activity.set({ targetType: "PageLayout", targetId: layout.id });
  const template = templateByKey(layout.templateKey ?? DEFAULT_TEMPLATE_KEY) ?? TEMPLATES[0]!;
  const design: Design = layout.publishedBlocks
    ? readDesign(layout.publishedBlocks)
    : { blocks: blocksOf(template, newUid), theme: template.theme };
  await ctx.db.pageLayout.update({
    where: { id: layout.id },
    data: { draftBlocks: json(design.blocks), theme: design.theme },
  });
  return { layoutId: layout.id };
}

/** Starts the draft over from a template. The published page is untouched until the artist publishes. */
export async function applyTemplate(ctx: ServiceCtx, artist: ArtistRef, key: string) {
  const template = templateByKey(key);
  if (!template)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Template not found" });
  const layout = await ensureLayout(ctx, artist);
  ctx.activity.set({ targetType: "PageLayout", targetId: layout.id });
  await ctx.db.pageLayout.update({
    where: { id: layout.id },
    data: {
      templateKey: template.key,
      draftBlocks: json(blocksOf(template, newUid)),
      theme: template.theme,
    },
  });
  return { layoutId: layout.id };
}

/** Takes the page offline; the fan app goes back to its standard artist page. The draft stays. */
export async function unpublishPage(ctx: ServiceCtx, artist: ArtistRef) {
  const layout = await ensureLayout(ctx, artist);
  ctx.activity.set({ targetType: "PageLayout", targetId: layout.id });
  await ctx.db.pageLayout.update({
    where: { id: layout.id },
    data: { status: "DRAFT", isActive: false },
  });
  return { layoutId: layout.id };
}

/** The draft, for the owner's live preview on the fan app. */
export async function draftDesign(ctx: Pick<ServiceCtx, "db">, artistId: string): Promise<Design> {
  const layout = await ctx.db.pageLayout.findFirst({
    where: { artistId },
    orderBy: { createdAt: "asc" },
    select: { draftBlocks: true, theme: true },
  });
  return layout
    ? { blocks: normalizeBlocks(layout.draftBlocks, newUid), theme: themeOf(layout.theme) }
    : { blocks: normalizeBlocks([], newUid), theme: DEFAULT_THEME };
}
