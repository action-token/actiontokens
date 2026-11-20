import { AppError, ErrorCodes } from "@actiontokens/errors";
import { isOwnS3Url } from "@actiontokens/storage";
import { slugFromName, validateSlug } from "@actiontokens/utils/slug";

import type { Context } from "../../context";
import { invalid } from "./items";

type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; slug: string };

/** Limits carried over from the old Bandcoin app's profile form. */
export const NAME_MIN = 3;
export const NAME_MAX = 98;
export const BIO_MAX = 200;

export type ProfileInput = {
  name: string;
  bio: string;
  website: string;
  twitter: string;
  instagram: string;
};

/** Everything the Settings page shows: the profile, what the artist has made, and their accounts. */
export async function getProfile(ctx: Pick<Context, "db">, artist: { id: string }) {
  const [row, subscribers] = await Promise.all([
    ctx.db.artist.findUniqueOrThrow({
      where: { id: artist.id },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        website: true,
        twitter: true,
        instagram: true,
        status: true,
        createdAt: true,
        issuerAccount: { select: { publicKey: true, activatedAt: true } },
        storageAccount: { select: { publicKey: true, activatedAt: true } },
        fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
        _count: {
          select: {
            followers: true,
            pins: true,
            posts: true,
            bounties: true,
            items: { where: { deletedAt: null } },
          },
        },
      },
    }),
    // Followers who also trust the fan token.
    ctx.db.follow.count({ where: { artistId: artist.id, isTemporary: false } }),
  ]);
  const { _count, fanTokenItem, ...profile } = row;
  return {
    ...profile,
    fanToken: fanTokenItem?.classicToken ?? null,
    counts: { ..._count, subscribers },
  };
}

/** "@luna", "https://x.com/luna" or "luna" → "luna"; empty stays null. */
export function handleOf(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?[^/]+\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  if (!text) return null;
  if (!/^[A-Za-z0-9_.]{1,30}$/.test(text)) throw invalid("Use a handle like @yourname.");
  return text;
}

/** An https address, or null when empty. A bare "example.com" gets https:// added. */
export function websiteOf(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) throw new Error("no domain");
    return url.toString();
  } catch {
    throw invalid("Enter a website address like example.com.");
  }
}

/**
 * Saves the profile. The page address follows the name: a new name gives a new
 * slug, and the old one is kept in the history so shared links redirect. A slug
 * another artist uses now, or used before, can't be taken.
 */
export async function updateProfile(ctx: ServiceCtx, artist: ArtistRef, input: ProfileInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX)
    throw invalid(`Use ${NAME_MIN} to ${NAME_MAX} characters for your name.`);
  const bio = input.bio.trim();
  if (bio.length > BIO_MAX) throw invalid(`Keep your bio to ${BIO_MAX} characters.`);

  const details = {
    name,
    bio: bio || null,
    website: websiteOf(input.website),
    twitter: handleOf(input.twitter),
    instagram: handleOf(input.instagram),
  };

  const slug = slugFromName(name);
  const renamed = slug !== artist.slug;
  if (renamed) {
    const problem = validateSlug(slug);
    if (problem) throw invalid(`That name makes the page address "${slug}": ${problem}.`);
    const [current, previous] = await Promise.all([
      ctx.db.artist.findUnique({ where: { slug }, select: { id: true } }),
      ctx.db.artistSlugHistory.findUnique({ where: { slug }, select: { artistId: true } }),
    ]);
    if ((current && current.id !== artist.id) || (previous && previous.artistId !== artist.id))
      throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
        message: `Another artist already uses the page address "${slug}". Try a slightly different name.`,
      });
  }

  await ctx.db.$transaction(async (tx) => {
    if (renamed) {
      // Taking back one of your own old addresses removes it from the history.
      await tx.artistSlugHistory.deleteMany({ where: { slug, artistId: artist.id } });
      await tx.artistSlugHistory.upsert({
        where: { slug: artist.slug },
        create: { slug: artist.slug, artistId: artist.id },
        update: {},
      });
    }
    await tx.artist.update({
      where: { id: artist.id },
      data: renamed ? { ...details, slug } : details,
    });
  });

  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  return { slug };
}

/** A new profile picture or cover, uploaded to our own storage first. */
export async function setProfileImage(
  ctx: ServiceCtx,
  artist: { id: string },
  input: { kind: "avatar" | "cover"; url: string | null },
) {
  if (input.url !== null && !isOwnS3Url(input.url)) throw invalid("Upload the picture again.");
  await ctx.db.artist.update({
    where: { id: artist.id },
    data: input.kind === "avatar" ? { avatarUrl: input.url } : { coverUrl: input.url },
  });
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  return { url: input.url };
}

/** Where an old page address now points, for the fan app's redirect; null when it was never used. */
export async function currentSlugFor(ctx: Pick<Context, "db">, slug: string) {
  const previous = await ctx.db.artistSlugHistory.findUnique({
    where: { slug },
    select: { artist: { select: { slug: true, status: true } } },
  });
  return previous?.artist.status === "APPROVED" ? previous.artist.slug : null;
}
