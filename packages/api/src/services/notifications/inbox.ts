import type { Context } from "../../context";
import { parseVanityKey } from "../artist/vanity-expire";
import { describeForArtist, describeNotification } from "./describe";

/** The fan app (and AR) shows the fan's notifications; the portal shows the artist's. */
export type Audience = "FAN" | "ARTIST";

/** How many notifications the bell shows, and the page loads at a time. */
export const INBOX_PAGE = 20;

const whereFor = (recipientId: string, audience: Audience) => ({
  recipientId,
  isForArtist: audience === "ARTIST",
});

/** A page of someone's notifications, newest first, worded for where they read them. */
export async function loadInbox(
  ctx: Pick<Context, "db">,
  recipientId: string,
  audience: Audience,
  cursor: string | null,
) {
  const where = whereFor(recipientId, audience);
  const [rows, unread] = await Promise.all([
    ctx.db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: INBOX_PAGE + 1,
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
  const page = rows.slice(0, INBOX_PAGE);

  // What the events are about, read once per page.
  const ids = [...new Set(page.flatMap((row) => (row.event.entityId ? [row.event.entityId] : [])))];
  const [bounties, items, posts] = ids.length
    ? await Promise.all([
        ctx.db.bounty.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }),
        ctx.db.item.findMany({
          where: { id: { in: ids } },
          select: { id: true, slug: true, title: true, type: true },
        }),
        ctx.db.post.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }),
      ])
    : [[], [], []];
  const bountyById = new Map(bounties.map((bounty) => [bounty.id, bounty]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const postById = new Map(posts.map((post) => [post.id, post]));

  return {
    unread,
    next: rows.length > INBOX_PAGE ? (page.at(-1)?.id ?? null) : null,
    items: page.map((row) => {
      const { actor, type, entityId } = row.event;
      const name = actor.artist?.name ?? actor.displayName ?? actor.username ?? "Someone";
      const subject = {
        actor: { name, username: actor.username, artistSlug: actor.artist?.slug ?? null },
        bounty: entityId ? bountyById.get(entityId) : null,
        item: entityId ? itemById.get(entityId) : null,
      };
      const { text, href } =
        audience === "ARTIST"
          ? describeForArtist(type, {
              ...subject,
              post: entityId ? postById.get(entityId) : null,
              vanity: type === "VANITY" ? parseVanityKey(entityId) : null,
            })
          : describeNotification(type, {
              ...subject,
              postId: type === "POST" || type === "REPLY" ? entityId : null,
            });
      return {
        id: row.id,
        type,
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

/** Marks every unseen notification for this audience seen. */
export async function markInboxSeen(
  ctx: Pick<Context, "db">,
  recipientId: string,
  audience: Audience,
) {
  const { count } = await ctx.db.notification.updateMany({
    where: { ...whereFor(recipientId, audience), seenAt: null },
    data: { seenAt: new Date() },
  });
  return { marked: count };
}
