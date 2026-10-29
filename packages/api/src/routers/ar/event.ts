import { z } from "zod";

import type {
  ArAnnouncement,
  ArComment,
  ArEventArtist,
  ArEventCard,
  ArEventDetail,
} from "@bandcoin/ar-core/ar/types";
import { site } from "@bandcoin/ar-core/site";
import { type Db, Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { livePinWhere } from "../../services/ar/pins";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/**
 * ── Events and announcements ───────────────────────────────────────────────
 *
 * The fan side of what artists publish from the artist portal. Both are
 * public, signed-out viewers can browse everything, and an artist's post is
 * live the moment it's saved. Sign-in guards what a viewer does: RSVP,
 * comment, and the Following filter.
 *
 * "Upcoming" means the event hasn't ended, so one already under way stays
 * in Upcoming until its end. Announcements past `expiresAt` drop out of
 * every query, by id too, so a shared link to one reads as gone.
 */

const artistSelect = { id: true, name: true, avatarUrl: true } as const;
const authorSelect = { id: true, displayName: true, username: true, avatarUrl: true } as const;

const artistOf = (a: { id: string; name: string; avatarUrl: string | null }): ArEventArtist => ({
  id: a.id,
  name: a.name,
  imageUrl: a.avatarUrl ?? site.assets.mark,
});

/** Artist-entered links, passed on only when they're plain web links. */
export const webUrl = (url: string | null) =>
  url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;

const PAGE = {
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().nullish(),
};

const TARGET = z.object({ kind: z.enum(["event", "announcement"]), id: z.string().min(1) });

async function followedIds(db: Db, userId: string | undefined) {
  if (!userId)
    throw new AppError(ErrorCodes.AUTH_REQUIRED, { message: "Sign in to see artists you follow." });
  const rows = await db.follow.findMany({ where: { userId }, select: { artistId: true } });
  return rows.map((r) => r.artistId);
}

const liveAnnouncement = (now: Date): Prisma.AnnouncementWhereInput => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

function cardInclude(userId: string | undefined) {
  return {
    artist: { select: artistSelect },
    _count: { select: { rsvps: true } },
    // Only the viewer's own RSVP, to answer "am I going?" without a second query.
    rsvps: { where: { userId: userId ?? "" }, select: { id: true }, take: 1 },
  } satisfies Prisma.EventInclude;
}

type CardRow = Prisma.EventGetPayload<{ include: ReturnType<typeof cardInclude> }>;

function toCard(row: CardRow): ArEventCard {
  return {
    id: row.id,
    title: row.title,
    coverImage: row.coverUrl,
    startDate: row.startsAt.toISOString(),
    endDate: row.endsAt.toISOString(),
    venueName: row.venueName,
    address: row.address,
    hasVenue: row.latitude != null && row.longitude != null,
    hasLink: webUrl(row.link) !== null,
    artist: artistOf(row.artist),
    goingCount: row._count.rsvps,
    capacity: row.capacity,
    viewer: { going: row.rsvps.length > 0 },
  };
}

const announcementInclude = {
  artist: { select: artistSelect },
  _count: { select: { comments: true } },
} as const;

function toAnnouncement(
  row: Prisma.AnnouncementGetPayload<{ include: typeof announcementInclude }>,
): ArAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    images: row.imageUrls,
    pinned: row.isPinned,
    ctaLabel: row.ctaLabel,
    ctaUrl: webUrl(row.ctaUrl),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    artist: artistOf(row.artist),
    commentCount: row._count.comments,
  };
}

/** Throws NOT_FOUND unless the target exists and is still visible. */
async function assertTarget(db: Db, target: z.infer<typeof TARGET>) {
  const found =
    target.kind === "event"
      ? await db.event.count({ where: { id: target.id } })
      : await db.announcement.count({ where: { id: target.id, ...liveAnnouncement(new Date()) } });
  if (!found) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: target.kind === "event" ? "Event not found." : "Announcement not found.",
    });
  }
}

export const eventRouter = createRouter({
  list: publicProcedure
    .input(
      z.object({
        when: z.enum(["upcoming", "past"]).default("upcoming"),
        following: z.boolean().default(false),
        artistId: z.string().optional(),
        ...PAGE,
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user.id;
      const now = new Date();
      const where: Prisma.EventWhereInput = {
        endsAt: input.when === "upcoming" ? { gte: now } : { lt: now },
        ...(input.artistId ? { artistId: input.artistId } : {}),
      };
      if (input.following) where.AND = [{ artistId: { in: await followedIds(ctx.db, userId) } }];

      // Upcoming reads soonest first; past reads most recent first.
      const dir = input.when === "upcoming" ? "asc" : "desc";
      const rows = await ctx.db.event.findMany({
        where,
        orderBy: [{ startsAt: dir }, { id: dir }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: cardInclude(userId),
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return { items: page.map(toCard), nextCursor: hasMore ? page[page.length - 1]!.id : null };
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArEventDetail> => {
      const userId = ctx.session?.user.id;
      const row = await ctx.db.event.findUnique({
        where: { id: input.id },
        include: {
          ...cardInclude(userId),
          _count: { select: { rsvps: true, comments: true } },
          // Linked pins go through the map's own "live" filter, so an event
          // can't surface a pin that's pending review, hidden or over.
          pins: {
            where: livePinWhere(userId ?? null),
            select: {
              title: true,
              imageUrl: true,
              artist: { select: { avatarUrl: true } },
              spots: { where: { isHidden: false }, select: { id: true }, take: 1 },
            },
          },
          // Only funded bounties are shown anywhere.
          bounties: { where: { fundTxHash: { not: null } }, select: { id: true, title: true } },
        },
      });
      if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Event not found." });

      const card = toCard(row);
      return {
        ...card,
        description: row.description,
        latitude: row.latitude,
        longitude: row.longitude,
        link: webUrl(row.link),
        linkLabel: row.linkLabel,
        pins: row.pins.flatMap((p) => {
          const spot = p.spots[0];
          return spot
            ? [
                {
                  id: spot.id,
                  title: p.title,
                  imageUrl: p.imageUrl ?? p.artist.avatarUrl ?? site.assets.mark,
                },
              ]
            : [];
        }),
        bounties: row.bounties.map((b) => ({
          id: b.id,
          title: b.title,
          imageUrl: card.artist.imageUrl,
        })),
        commentCount: row._count.comments,
        isFull: row.capacity != null && card.goingCount >= row.capacity,
        isPast: row.endsAt < new Date(),
      };
    }),

  /** RSVP is free and only says "I'm coming"; capacity is checked so two fans can't take the last spot. */
  rsvp: authedProcedure
    .input(z.object({ id: z.string().min(1), going: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const event = await ctx.db.event.findUnique({
        where: { id: input.id },
        select: { id: true, endsAt: true, capacity: true },
      });
      if (!event)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Event not found." });
      ctx.activity.set({ targetType: "Event", targetId: event.id });

      if (!input.going) {
        await ctx.db.eventRsvp.deleteMany({ where: { eventId: event.id, userId } });
      } else {
        if (event.endsAt < new Date())
          throw new AppError(ErrorCodes.VALIDATION_FAILED, {
            message: "This event has already ended.",
          });
        try {
          // Serializable, so the count and the insert commit together or not at all.
          await ctx.db.$transaction(
            async (tx) => {
              const mine = await tx.eventRsvp.findUnique({
                where: { eventId_userId: { eventId: event.id, userId } },
                select: { id: true },
              });
              if (mine) return;
              if (
                event.capacity != null &&
                (await tx.eventRsvp.count({ where: { eventId: event.id } })) >= event.capacity
              ) {
                throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
                  message: "This event is full.",
                });
              }
              await tx.eventRsvp.create({ data: { eventId: event.id, userId } });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
          // P2034: lost a serialization race, safe to try again. P2002: a double tap already inserted it.
          if (error.code === "P2034")
            throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
              message: "Lots of people are RSVPing. Try again.",
            });
          if (error.code !== "P2002") throw error;
        }
      }

      const goingCount = await ctx.db.eventRsvp.count({ where: { eventId: event.id } });
      return { going: input.going, goingCount };
    }),

  announcements: publicProcedure
    .input(
      z.object({ following: z.boolean().default(false), artistId: z.string().optional(), ...PAGE }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.AnnouncementWhereInput = {
        AND: [
          liveAnnouncement(new Date()),
          ...(input.artistId ? [{ artistId: input.artistId }] : []),
          ...(input.following
            ? [{ artistId: { in: await followedIds(ctx.db, ctx.session?.user.id) } }]
            : []),
        ],
      };
      // "Pin to top" puts a post first on the artist's own list. In the
      // all-artists feed it's only a badge, so the feed stays newest first.
      const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] = input.artistId
        ? [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];
      const rows = await ctx.db.announcement.findMany({
        where,
        orderBy,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: announcementInclude,
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: page.map(toAnnouncement),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    }),

  announcement: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ArAnnouncement> => {
      const row = await ctx.db.announcement.findFirst({
        where: { id: input.id, ...liveAnnouncement(new Date()) },
        include: announcementInclude,
      });
      if (!row)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Announcement not found." });
      return toAnnouncement(row);
    }),

  // ── Comments (shared by both kinds) ──────────────────────────────────────

  comments: publicProcedure.input(TARGET).query(async ({ ctx, input }): Promise<ArComment[]> => {
    const userId = ctx.session?.user.id;
    const query = {
      orderBy: { createdAt: "desc" as const },
      take: 100,
      include: { author: { select: authorSelect } },
    };
    const rows =
      input.kind === "event"
        ? await ctx.db.eventComment.findMany({ where: { eventId: input.id }, ...query })
        : await ctx.db.announcementComment.findMany({
            where: { announcementId: input.id },
            ...query,
          });
    return rows.map((c) => ({
      id: c.id,
      content: c.body,
      createdAt: c.createdAt.toISOString(),
      author: {
        id: c.author.id,
        name: c.author.displayName ?? c.author.username,
        image: c.author.avatarUrl,
      },
      mine: c.authorId === userId,
    }));
  }),

  addComment: authedProcedure
    .input(z.object({ target: TARGET, content: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await assertTarget(ctx.db, input.target);
      const data = { authorId: ctx.session.user.id, body: input.content };
      const row =
        input.target.kind === "event"
          ? await ctx.db.eventComment.create({ data: { ...data, eventId: input.target.id } })
          : await ctx.db.announcementComment.create({
              data: { ...data, announcementId: input.target.id },
            });
      ctx.activity.set({
        targetType: input.target.kind === "event" ? "EventComment" : "AnnouncementComment",
        targetId: row.id,
      });
      return { id: row.id };
    }),

  /** The comment's author, or the artist who owns the event or announcement. */
  deleteComment: authedProcedure
    .input(z.object({ kind: TARGET.shape.kind, commentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const owner = { select: { artist: { select: { userId: true } } } };
      const row =
        input.kind === "event"
          ? await ctx.db.eventComment.findUnique({
              where: { id: input.commentId },
              select: { authorId: true, event: owner },
            })
          : await ctx.db.announcementComment.findUnique({
              where: { id: input.commentId },
              select: { authorId: true, announcement: owner },
            });
      if (!row)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Comment not found." });
      const ownerId = "event" in row ? row.event.artist.userId : row.announcement.artist.userId;
      if (row.authorId !== userId && ownerId !== userId) {
        throw new AppError(ErrorCodes.AUTH_FORBIDDEN, {
          message: "You can't delete this comment.",
        });
      }
      ctx.activity.set({
        targetType: input.kind === "event" ? "EventComment" : "AnnouncementComment",
        targetId: input.commentId,
      });
      if (input.kind === "event")
        await ctx.db.eventComment.delete({ where: { id: input.commentId } });
      else await ctx.db.announcementComment.delete({ where: { id: input.commentId } });
      return { deleted: true };
    }),
});
