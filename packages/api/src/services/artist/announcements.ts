import { AppError, ErrorCodes } from "@actiontokens/errors";
import { isOwnS3Url } from "@actiontokens/storage";

import type { Context } from "../../context";
import { webLink } from "./events";
import { invalid } from "./items";

/** Announcements: short news posts fans see in the AR app, optionally pinned, with a button and an end date. */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

const MAX_IMAGES = 4;

export type AnnouncementInput = {
  title: string;
  body: string;
  imageUrls?: string[];
  isPinned?: boolean;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Hidden from the feed after this; null = never expires */
  expiresAt?: Date | null;
};

function check(input: Partial<AnnouncementInput>, now: Date) {
  if (
    input.title !== undefined &&
    (input.title.trim().length === 0 || input.title.trim().length > 100)
  )
    throw invalid("Give the announcement a title of up to 100 characters.");
  if (input.body !== undefined && (input.body.trim().length === 0 || input.body.length > 2000))
    throw invalid("Write the announcement in up to 2000 characters.");
  if (input.imageUrls !== undefined) {
    if (input.imageUrls.length > MAX_IMAGES) throw invalid(`Use at most ${MAX_IMAGES} images.`);
    if (input.imageUrls.some((url) => !isOwnS3Url(url))) throw invalid("Upload the images again.");
  }
  if (input.ctaLabel && input.ctaLabel.length > 30)
    throw invalid("Keep the button label under 30 characters.");
  if (input.expiresAt && (Number.isNaN(input.expiresAt.getTime()) || input.expiresAt <= now))
    throw invalid("Pick an end date in the future, or leave it empty.");
}

/** The button needs both a label and an address. */
function cta(input: Pick<AnnouncementInput, "ctaLabel" | "ctaUrl">) {
  const label = input.ctaLabel?.trim() || null;
  const url = input.ctaUrl?.trim() || null;
  if (Boolean(label) !== Boolean(url)) throw invalid("A button needs both a label and a link.");
  return { ctaLabel: label, ctaUrl: url ? webLink(url, "The button link") : null };
}

async function ownAnnouncement(ctx: ServiceCtx, artist: ArtistRef, announcementId: string) {
  const row = await ctx.db.announcement.findFirst({
    where: { id: announcementId, artistId: artist.id },
    select: { id: true, ctaLabel: true, ctaUrl: true },
  });
  if (!row)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Announcement not found" });
  ctx.activity.set({ targetType: "Announcement", targetId: row.id });
  return row;
}

export async function listAnnouncements(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const rows = await ctx.db.announcement.findMany({
    where: { artistId: artist.id },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { comments: true } } },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, comments: _count.comments }));
}

export async function createAnnouncement(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: AnnouncementInput,
  now = new Date(),
) {
  check(input, now);
  const row = await ctx.db.announcement.create({
    data: {
      artistId: artist.id,
      title: input.title.trim(),
      body: input.body.trim(),
      imageUrls: input.imageUrls ?? [],
      isPinned: input.isPinned ?? false,
      expiresAt: input.expiresAt ?? null,
      ...cta(input),
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Announcement", targetId: row.id });
  return { announcementId: row.id };
}

export async function updateAnnouncement(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: Partial<AnnouncementInput> & { announcementId: string },
  now = new Date(),
) {
  const existing = await ownAnnouncement(ctx, artist, input.announcementId);
  check(input, now);
  const touchesCta = input.ctaLabel !== undefined || input.ctaUrl !== undefined;
  const data = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.body !== undefined ? { body: input.body.trim() } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(touchesCta
      ? cta({
          ctaLabel: input.ctaLabel !== undefined ? input.ctaLabel : existing.ctaLabel,
          ctaUrl: input.ctaUrl !== undefined ? input.ctaUrl : existing.ctaUrl,
        })
      : {}),
  };
  if (Object.keys(data).length > 0)
    await ctx.db.announcement.update({ where: { id: existing.id }, data });
  return { announcementId: existing.id };
}

export async function removeAnnouncement(
  ctx: ServiceCtx,
  artist: ArtistRef,
  announcementId: string,
) {
  const row = await ownAnnouncement(ctx, artist, announcementId);
  await ctx.db.announcement.delete({ where: { id: row.id } });
  return { announcementId: row.id };
}
