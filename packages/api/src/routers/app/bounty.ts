import { z } from "zod";
import { notifyArtist } from "../../services/notifications/send";

import type { ChainConfig } from "@actiontokens/chain/server";
import type { Db, Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { prepareClaim, submitClaim } from "../../services/bounty/claim";
import { prizeView } from "../../services/bounty/prize";
import { countScrobbles } from "../../services/lastfm";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/**
 * Bounties for fans, feature for feature with the old Action Tokens (bandfan
 * `main`): browse (All / Not joined / Joined, search, newest or biggest
 * prize), top bounties and recent activity, then one bounty with its
 * participants, your reports, your listening progress and your prize claim.
 * Artists run their bounties (status, winners) from the artist portal.
 */

const PAGE_SIZE = 20;
const SNIPPET = 250;
const bountyInput = z.object({ bountyId: z.string().min(1) });

const artistSelect = { id: true, name: true, slug: true, avatarUrl: true, userId: true } as const;
const userSelect = { username: true, displayName: true, avatarUrl: true } as const;

/** Only funded bounties are shown: the prize must already sit in escrow. */
/** Bounties fans can see: funded, and not hidden by an admin. */
export const publicBountyWhere = { fundTxHash: { not: null }, hiddenAt: null } as const;

/** What a bounty card needs (the Bounties page and the home shelf). */
export const cardSelect = {
  id: true,
  title: true,
  summary: true,
  description: true,
  prizeAmount: true,
  prizeCurrency: true,
  prizeAssetCode: true,
  prizeAssetIssuer: true,
  maxWinners: true,
  status: true,
  createdAt: true,
  organization: { select: artistSelect },
  musicRule: {
    select: {
      tracks: {
        orderBy: { createdAt: "asc" },
        take: 3,
        select: { title: true, albumArtUrl: true },
      },
    },
  },
  _count: { select: { participants: true, submissions: true, winners: true } },
} as const;

type CardRow = Prisma.BountyGetPayload<{ select: typeof cardSelect }>;

const snippet = (text: string) => (text.length > SNIPPET ? `${text.slice(0, SNIPPET)}…` : text);

/** A bounty as the fan cards show it. */
export function toCard(
  row: CardRow,
  config: ChainConfig,
  viewerId: string | undefined,
  joined: boolean,
) {
  const { userId: artistUserId, ...artist } = row.organization;
  return {
    id: row.id,
    title: row.title,
    text: snippet(row.summary.trim() || row.description.trim()),
    prize: prizeView(row, config),
    maxWinners: row.maxWinners,
    status: row.status,
    artist,
    musicArt: row.musicRule?.tracks ?? [],
    participants: row._count.participants,
    submissions: row._count.submissions,
    winners: row._count.winners,
    joined,
    isCreator: artistUserId === viewerId,
  };
}

/** The bounty, if fans can take part right now. */
async function runningBounty(db: Db, bountyId: string, userId: string) {
  const bounty = await db.bounty.findFirst({
    where: { id: bountyId, ...publicBountyWhere },
    select: { id: true, status: true, organization: { select: { userId: true } } },
  });
  if (!bounty)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This bounty doesn't exist." });
  if (bounty.organization.userId === userId)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "You can't join your own bounty.",
    });
  if (bounty.status !== "RUNNING")
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message:
        bounty.status === "PAUSED" ? "This bounty is paused for now." : "This bounty has ended.",
    });
  return bounty;
}

async function participantOf(db: Db, bountyId: string, userId: string) {
  const participant = await db.bountyParticipant.findUnique({
    where: { bountyId_userId: { bountyId, userId } },
    select: { id: true, joinedAt: true },
  });
  if (!participant)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Join the bounty first." });
  return participant;
}

/** Per-track listening progress, as the old "My Listening Progress" showed it. */
export function progressOf(
  tracks: { id: string; targetPlays: number }[],
  rows: { trackId: string; currentPlays: number; isSatisfied: boolean }[],
) {
  const byTrack = new Map(rows.map((row) => [row.trackId, row]));
  const perTrack = tracks.map((track) => {
    const row = byTrack.get(track.id);
    const plays = row?.currentPlays ?? 0;
    return {
      trackId: track.id,
      plays,
      done: row?.isSatisfied ?? false,
      percent:
        track.targetPlays > 0 ? Math.min(100, Math.round((plays / track.targetPlays) * 100)) : 0,
    };
  });
  return {
    tracks: perTrack,
    doneCount: perTrack.filter((track) => track.done).length,
    percent:
      perTrack.length > 0
        ? Math.round(perTrack.reduce((sum, track) => sum + track.percent, 0) / perTrack.length)
        : 0,
  };
}

export const bountyRouter = createRouter({
  /** The bounty grid. All and Not joined hide ended bounties; Joined shows every one you're in. */
  list: publicProcedure
    .input(
      z.object({
        filter: z.enum(["all", "not_joined", "joined"]).default("all"),
        search: z.string().trim().max(80).optional(),
        sort: z.enum(["newest", "prize"]).default("newest"),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.session?.user.id;
      if (input.filter === "joined" && !viewerId) return { items: [], nextCursor: null };

      const where: Prisma.BountyWhereInput = {
        ...publicBountyWhere,
        ...(input.search ? { title: { contains: input.search, mode: "insensitive" } } : {}),
        ...(input.filter === "joined"
          ? { participants: { some: { userId: viewerId } } }
          : { status: { not: "COMPLETED" } }),
        ...(input.filter === "not_joined" && viewerId
          ? {
              participants: { none: { userId: viewerId } },
              organization: { userId: { not: viewerId } },
            }
          : {}),
      };
      const rows = await ctx.db.bounty.findMany({
        where,
        orderBy:
          input.sort === "prize"
            ? [{ prizeAmount: "desc" }, { id: "desc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: cardSelect,
      });

      const page = rows.slice(0, PAGE_SIZE);
      const joined = new Set(
        viewerId
          ? (
              await ctx.db.bountyParticipant.findMany({
                where: { userId: viewerId, bountyId: { in: page.map((row) => row.id) } },
                select: { bountyId: true },
              })
            ).map((row) => row.bountyId)
          : [],
      );
      return {
        items: page.map((row) => toCard(row, ctx.chain.config, viewerId, joined.has(row.id))),
        nextCursor: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
      };
    }),

  /** "Top Bounties": the running ones with the biggest prizes. */
  top: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.bounty.findMany({
      where: { ...publicBountyWhere, status: "RUNNING" },
      orderBy: { prizeAmount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        prizeAmount: true,
        prizeCurrency: true,
        prizeAssetCode: true,
        prizeAssetIssuer: true,
        organization: { select: { name: true, avatarUrl: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.organization,
      prize: prizeView(row, ctx.chain.config),
    }));
  }),

  /** "Recent Activity": who joined, submitted or won, newest first. */
  recent: publicProcedure.query(async ({ ctx }) => {
    const take = 12;
    const bounty = { select: { id: true, title: true } } as const;
    const user = { select: userSelect } as const;
    const [joins, submissions, wins] = await Promise.all([
      ctx.db.bountyParticipant.findMany({
        take,
        orderBy: { joinedAt: "desc" },
        select: { id: true, joinedAt: true, user, bounty },
      }),
      ctx.db.bountySubmission.findMany({
        take,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, user, bounty },
      }),
      ctx.db.bountyWinner.findMany({
        take,
        orderBy: { selectedAt: "desc" },
        select: { id: true, selectedAt: true, user, bounty },
      }),
    ]);
    return [
      ...joins.map((row) => ({
        id: `join-${row.id}`,
        type: "join" as const,
        at: row.joinedAt,
        user: row.user,
        bounty: row.bounty,
      })),
      ...submissions.map((row) => ({
        id: `submit-${row.id}`,
        type: "submit" as const,
        at: row.createdAt,
        user: row.user,
        bounty: row.bounty,
      })),
      ...wins.map((row) => ({
        id: `win-${row.id}`,
        type: "win" as const,
        at: row.selectedAt,
        user: row.user,
        bounty: row.bounty,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, take);
  }),

  /** One bounty, plus where you stand: joined, your reports, your listening progress, your prize. */
  byId: publicProcedure.input(bountyInput).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user.id;
    const bounty = await ctx.db.bounty.findFirst({
      where: { id: input.bountyId, ...publicBountyWhere },
      select: {
        ...cardSelect,
        rewardNote: true,
        instructions: true,
        requiresActionCam: true,
        musicRule: {
          select: {
            mode: true,
            ruleType: true,
            requiredTracks: true,
            totalPlays: true,
            tracks: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                title: true,
                artistName: true,
                albumArtUrl: true,
                targetPlays: true,
                lastFmUrl: true,
                spotifyUrl: true,
                youtubeUrl: true,
              },
            },
          },
        },
        winners: {
          orderBy: { selectedAt: "asc" },
          select: {
            userId: true,
            prizeAmount: true,
            claimedAt: true,
            user: { select: userSelect },
          },
        },
        participants: {
          orderBy: { joinedAt: "desc" },
          take: 50,
          select: { userId: true, joinedAt: true, user: { select: userSelect } },
        },
      },
    });
    if (!bounty)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This bounty doesn't exist." });

    const [participant, submissions, lastFm] = viewerId
      ? await Promise.all([
          ctx.db.bountyParticipant.findUnique({
            where: { bountyId_userId: { bountyId: bounty.id, userId: viewerId } },
            select: {
              joinedAt: true,
              trackProgress: { select: { trackId: true, currentPlays: true, isSatisfied: true } },
            },
          }),
          ctx.db.bountySubmission.findMany({
            where: { bountyId: bounty.id, userId: viewerId },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              body: true,
              createdAt: true,
              attachments: { select: { id: true, url: true, type: true, fileName: true } },
            },
          }),
          ctx.db.lastFmAccount.findFirst({
            where: { userId: viewerId, isConnected: true },
            select: { username: true },
          }),
        ])
      : [null, [], null];

    const won = new Map(bounty.winners.map((row) => [row.userId, row]));
    const mine = viewerId ? won.get(viewerId) : undefined;
    const tracks = bounty.musicRule?.tracks ?? [];

    return {
      ...toCard(bounty, ctx.chain.config, viewerId, participant !== null),
      summary: bounty.summary,
      description: bounty.description,
      rewardNote: bounty.rewardNote,
      instructions: bounty.instructions,
      requiresActionCam: bounty.requiresActionCam,
      createdAt: bounty.createdAt,
      music: bounty.musicRule && {
        mode: bounty.musicRule.mode,
        ruleType: bounty.musicRule.ruleType,
        requiredTracks: bounty.musicRule.requiredTracks,
        totalPlays: bounty.musicRule.totalPlays,
        tracks,
      },
      winnerList: bounty.winners.map((row) => ({
        user: row.user,
        prize: row.prizeAmount.toString(),
        claimed: row.claimedAt !== null,
      })),
      participantList: bounty.participants.map((row) => ({
        user: row.user,
        joinedAt: row.joinedAt,
        isMe: row.userId === viewerId,
        prize: won.get(row.userId)?.prizeAmount.toString() ?? null,
      })),
      me: viewerId
        ? {
            joinedAt: participant?.joinedAt ?? null,
            submissions,
            winner: mine
              ? { prize: mine.prizeAmount.toString(), claimed: mine.claimedAt !== null }
              : null,
            lastFm: lastFm?.username ?? null,
            progress:
              participant && tracks.length > 0
                ? progressOf(tracks, participant.trackProgress)
                : null,
          }
        : null,
    };
  }),

  /** Join a running bounty. Joining twice is fine and changes nothing. */
  join: authedProcedure.input(bountyInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const bounty = await runningBounty(ctx.db, input.bountyId, userId);
    const existing = await ctx.db.bountyParticipant.findUnique({
      where: { bountyId_userId: { bountyId: bounty.id, userId } },
      select: { id: true },
    });
    if (existing) return { joined: true };

    await ctx.db.bountyParticipant.create({ data: { bountyId: bounty.id, userId } });
    await notifyArtist(ctx, {
      type: "BOUNTY_JOINED",
      actorId: userId,
      entityId: bounty.id,
      artistUserId: bounty.organization.userId,
    });
    ctx.activity.set({ targetType: "Bounty", targetId: bounty.id });
    return { joined: true };
  }),

  /** Send a report (markdown) on a running bounty you've joined. */
  submitReport: authedProcedure
    .input(
      bountyInput.extend({
        content: z.string().trim().min(1, "Write something first").max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const bounty = await runningBounty(ctx.db, input.bountyId, userId);
      await participantOf(ctx.db, bounty.id, userId);
      const submission = await ctx.db.bountySubmission.create({
        data: { bountyId: bounty.id, userId, body: input.content },
        select: { id: true },
      });
      await notifyArtist(ctx, {
        type: "BOUNTY_SUBMISSION",
        actorId: userId,
        entityId: bounty.id,
        artistUserId: bounty.organization.userId,
      });
      ctx.activity.set({ targetType: "Bounty", targetId: bounty.id });
      return submission;
    }),

  /**
   * Re-count your Last.fm plays for each song on a music bounty. Same rule as
   * before: the first sync stores a baseline, later syncs count plays above it.
   */
  syncProgress: authedProcedure.input(bountyInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const account = await ctx.db.lastFmAccount.findFirst({
      where: { userId, isConnected: true },
      select: { username: true },
    });
    if (!account)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Connect Last.fm first." });
    const participant = await participantOf(ctx.db, input.bountyId, userId);
    const tracks = await ctx.db.bountyTrack.findMany({
      where: { bountyId: input.bountyId },
      select: { id: true, title: true, artistName: true, targetPlays: true },
    });

    for (const track of tracks) {
      const total = await countScrobbles(
        account.username,
        track.title,
        track.artistName,
        participant.joinedAt.getTime() / 1000,
      ).catch(() => 0);
      const key = { participantId_trackId: { participantId: participant.id, trackId: track.id } };
      const existing = await ctx.db.bountyTrackProgress.findUnique({
        where: key,
        select: { baselinePlays: true },
      });
      const plays = Math.max(0, total - (existing?.baselinePlays ?? 0));
      await ctx.db.bountyTrackProgress.upsert({
        where: key,
        update: {
          currentPlays: plays,
          targetPlays: track.targetPlays,
          isSatisfied: plays >= track.targetPlays,
        },
        create: {
          participantId: participant.id,
          trackId: track.id,
          baselinePlays: total,
          currentPlays: 0,
          targetPlays: track.targetPlays,
        },
      });
    }
    return { synced: tracks.length };
  }),

  /** Stop using your Last.fm account for bounties. */
  disconnectLastFm: authedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.lastFmAccount.updateMany({
      where: { userId: ctx.session.user.id },
      data: { isConnected: false, sessionKey: null },
    });
    ctx.activity.set({ targetType: "LastFmAccount", targetId: ctx.session.user.id });
    return { disconnected: true };
  }),

  /** Step 1 of claiming a prize: the escrow call, ready to sign. */
  claimPrepare: authedProcedure
    .input(bountyInput)
    .mutation(({ ctx, input }) => prepareClaim(ctx, ctx.session.user, input.bountyId)),

  /** Step 2: the signed call (or, for custodial accounts, the unsigned one after the countdown). */
  claimSubmit: authedProcedure
    .input(bountyInput.extend({ xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitClaim(ctx, ctx.session.user, input.bountyId, input.xdr)),
});
