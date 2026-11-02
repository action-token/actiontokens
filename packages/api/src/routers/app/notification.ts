import { describeNotification } from "../../services/notifications/describe";
import { authedProcedure, createRouter } from "../../trpc";

/** How many notifications the bell shows. */
const LATEST = 20;

/**
 * The fan's notifications (artist ones show in the artist portal). Reading
 * changes nothing; opening the bell marks them seen.
 */
export const notificationRouter = createRouter({
  latest: authedProcedure.query(async ({ ctx }) => {
    const recipientId = ctx.session.user.id;
    const where = { recipientId, isForArtist: false };
    const [rows, unread] = await Promise.all([
      ctx.db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: LATEST,
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

    const ids = [
      ...new Set(rows.flatMap((row) => (row.event.entityId ? [row.event.entityId] : []))),
    ];
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
      items: rows.map((row) => {
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
  }),

  /** Marks every unseen notification seen (opening the bell). */
  markSeen: authedProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.notification.updateMany({
      where: { recipientId: ctx.session.user.id, isForArtist: false, seenAt: null },
      data: { seenAt: new Date() },
    });
    return { marked: count };
  }),
});
