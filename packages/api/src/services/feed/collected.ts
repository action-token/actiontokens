import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";

type ServiceCtx = Pick<Context, "db">;

/** Collected posts per page of the AR app's collection. */
export const COLLECTED_PAGE = 24;

const postSelect = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  organization: { select: { name: true, slug: true, avatarUrl: true } },
  media: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, type: true, url: true, title: true, thumbnailUrl: true },
  },
} as const;

/** The picture a post's card shows: its first photo, a video's still, else the artist. */
export function postCover(post: {
  media: { type: string; url: string; thumbnailUrl: string | null }[];
  organization: { avatarUrl: string | null };
}) {
  const image = post.media.find((file) => file.type === "IMAGE");
  if (image) return image.url;
  const still = post.media.find((file) => file.thumbnailUrl)?.thumbnailUrl;
  return still ?? post.organization.avatarUrl;
}

/** Posts the fan has collected by scanning their QR, newest first. */
export async function collectedPosts(ctx: ServiceCtx, user: SessionUser, cursor: string | null) {
  const where = { collectorId: user.id, post: { isImportOnly: false } };
  const [rows, total] = await Promise.all([
    ctx.db.postCollectible.findMany({
      where,
      orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
      take: COLLECTED_PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, collectedAt: true, post: { select: postSelect } },
    }),
    ctx.db.postCollectible.count({ where }),
  ]);
  const page = rows.slice(0, COLLECTED_PAGE);
  return {
    total,
    next: rows.length > COLLECTED_PAGE ? (page.at(-1)?.id ?? null) : null,
    items: page.map(({ post, collectedAt }) => ({
      postId: post.id,
      title: post.title,
      artist: post.organization,
      cover: postCover(post),
      kinds: [...new Set(post.media.map((file) => file.type))],
      collectedAt,
    })),
  };
}

/** One collected post in full, with which copy the fan holds ("#3 of 100"). */
export async function collectedPost(ctx: ServiceCtx, user: SessionUser, postId: string) {
  const mine = await ctx.db.postCollectible.findFirst({
    where: { postId, collectorId: user.id, post: { isImportOnly: false } },
    select: { collectedAt: true, post: { select: postSelect } },
  });
  if (!mine)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This post isn't in your collection.",
    });
  const [total, before] = await Promise.all([
    ctx.db.postCollectible.count({ where: { postId } }),
    ctx.db.postCollectible.count({
      where: { postId, collectorId: { not: null }, collectedAt: { lte: mine.collectedAt! } },
    }),
  ]);
  return {
    ...mine.post,
    cover: postCover(mine.post),
    collectedAt: mine.collectedAt,
    copy: { number: before, total },
  };
}
