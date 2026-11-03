import { z } from "zod";

import type { Context } from "../../context";
import { describeNotification } from "../../services/notifications/describe";
import { authedProcedure, createRouter } from "../../trpc";

/** How many notifications the bell shows, and the page loads at a time. */
const PAGE = 20;

/** A page of the fan's notifications (artist ones show in the artist portal), newest first. */
async function loadNotifications(
  ctx: Pick<Context, "db">,
  recipientId: string,
  cursor: string | null,
) {
  const where = { recipientId, isForArtist: false };
  const [rows, unread] = await Promise.all([
    ctx.db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        seenAt: true,
        createdAt: true,
        event: {
          select: {
            type: true,
            entityId: true,
            actor: {
              select: {
                displayName: true,
                username: true,
                avatarUrl: true,
                artist: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    }),
    ctx.db.notification.count({ where: { ...where, seenAt: null } }),
  ]);
  const page = rows.slice(0, PAGE);

  const ids = [...new Set(page.flatMap((row) => (row.event.entityId ? [row.event.entityId] : [])))];
  const [bounties, items] = ids.length
    ? await Promise.all([
        ctx.db.bounty.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }),
        ctx.db.item.findMany({
          where: { id: { in: ids } },
          select: { id: true, slug: true, title: true },
        }),
      ])
    : [[], []];
  const bountyById = new Map(bounties.map((bounty) => [bounty.id, bounty]));
  const itemById = new Map(items.map((item) => [item.id, item]));

  return {
    unread,
    next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null,
    items: page.map((row) => {
      const { actor, type, entityId } = row.event;
      const name = actor.artist?.name ?? actor.displayName ?? actor.username ?? "Someone";
      const { text, href } = describeNotification(type, {
        actor: { name, username: actor.username, artistSlug: actor.artist?.slug ?? null },
        bounty: entityId ? bountyById.get(entityId) : null,
        item: entityId ? itemById.get(entityId) : null,
      });
      return {
        id: row.id,
        text,
        href,
        avatarUrl: actor.avatarUrl,
        actorName: name,
        seen: row.seenAt !== null,
        at: row.createdAt,
      };
    }),
  };
}

/** Reading changes nothing; opening the bell or the page marks them seen. */
export const notificationRouter = createRouter({
  /** The bell: the latest few and how many are unread. */
  latest: authedProcedure.query(({ ctx }) => loadNotifications(ctx, ctx.session.user.id, null)),

  /** The Notifications page, a page at a time. */
  page: authedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(({ ctx, input }) => loadNotifications(ctx, ctx.session.user.id, input.cursor ?? null)),

  /** Marks every unseen notification seen. */
  markSeen: authedProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.notification.updateMany({
      where: { recipientId: ctx.session.user.id, isForArtist: false, seenAt: null },
      data: { seenAt: new Date() },
    });
    return { marked: count };
  }),
});
