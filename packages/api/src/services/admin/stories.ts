import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

/** Live stories for /admin/stories: an admin can take one down, with a reason the log keeps. */
type ServiceCtx = Pick<Context, "db" | "activity">;

const LIST_LIMIT = 100;

export async function listLiveStories(ctx: Pick<Context, "db">, now = new Date()) {
  const rows = await ctx.db.story.findMany({
    where: { removedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      caption: true,
      audience: true,
      createdAt: true,
      expiresAt: true,
      organization: { select: { id: true, name: true, slug: true } },
      _count: { select: { views: true } },
    },
  });
  return rows.map(({ _count, ...story }) => ({ ...story, views: _count.views }));
}

export async function takeDownStory(
  ctx: ServiceCtx,
  input: { storyId: string; reason: string },
  now = new Date(),
) {
  const story = await ctx.db.story.findUnique({
    where: { id: input.storyId },
    select: { id: true },
  });
  if (!story) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Story not found" });
  ctx.activity.set({ targetType: "Story", targetId: story.id });
  await ctx.db.story.update({
    where: { id: story.id },
    data: { removedAt: now, removedReason: input.reason.trim() },
  });
  return { storyId: story.id };
}
