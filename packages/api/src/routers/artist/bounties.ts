import { z } from "zod";

import { createBounty, discardUnfunded, getBounty, listBounties, listParticipants, listSubmissions, PRIZE_CURRENCIES, setBountyStatus, updateBounty } from "../../services/artist/bounties";
import { fundingSources, prepareFunding, prepareWinner, submitFunding, submitWinner } from "../../services/artist/bounty-escrow";
import { searchTracks, topTracks } from "../../services/lastfm-search";
import { artistProcedure, createRouter } from "../../trpc";

const track = z.object({
  title: z.string().trim().min(1).max(200),
  artistName: z.string().trim().min(1).max(200),
  albumName: z.string().max(200).nullish(),
  albumArtUrl: z.string().max(1000).nullish(),
  durationSec: z.number().int().min(1).max(7200),
  targetPlays: z.number().int().min(1).max(1000),
  lastFmUrl: z.string().max(1000),
  spotifyUrl: z.string().max(1000).nullish(),
  youtubeUrl: z.string().max(1000).nullish(),
});

const music = z.object({
  mode: z.enum(["MUSIC_ONLY", "HYBRID"]),
  ruleType: z.enum(["ALL", "ANY_N", "TOTAL_PLAYS"]),
  requiredTracks: z.number().int().nullish(),
  totalPlays: z.number().int().nullish(),
  tracks: z.array(track).max(10),
});

const text = {
  title: z.string().trim().max(150),
  summary: z.string().max(700),
  description: z.string().max(7000),
  rewardNote: z.string().max(700).nullish(),
  instructions: z.array(z.string().max(300)).max(20),
  requiresActionCam: z.boolean(),
  eventId: z.string().nullish(),
  music: music.nullish(),
};

const bountyId = z.object({ bountyId: z.string().min(1) });

/** The artist's bounties (see services/artist/bounties and bounty-escrow). Contract calls are unchanged from the old Bandcoin. */
export const bountiesRouter = createRouter({
  list: artistProcedure.query(({ ctx }) => listBounties(ctx, ctx.artist)),
  get: artistProcedure.input(bountyId).query(({ ctx, input }) => getBounty(ctx, ctx.artist, input.bountyId)),
  participants: artistProcedure.input(bountyId).query(({ ctx, input }) => listParticipants(ctx, ctx.artist, input.bountyId)),
  submissions: artistProcedure.input(bountyId).query(({ ctx, input }) => listSubmissions(ctx, ctx.artist, input.bountyId)),

  /** What the wallet and the storage account hold, so the form can show it next to the prize. */
  fundingSources: artistProcedure.query(({ ctx }) => fundingSources(ctx, ctx.artist, ctx.session.user)),

  create: artistProcedure
    .input(
      z.object({
        ...text,
        prizeAmount: z.string().trim().max(30),
        prizeCurrency: z.enum(PRIZE_CURRENCIES),
        maxWinners: z.number().int(),
        fundedFromStorage: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) => createBounty(ctx, ctx.artist, input)),

  update: artistProcedure
    .input(z.object(text).partial().extend({ bountyId: z.string().min(1) }))
    .mutation(({ ctx, input }) => updateBounty(ctx, ctx.artist, input)),

  setStatus: artistProcedure
    .input(bountyId.extend({ status: z.enum(["RUNNING", "PAUSED", "COMPLETED"]) }))
    .mutation(({ ctx, input }) => setBountyStatus(ctx, ctx.artist, input)),

  /** Throw away a draft whose funding failed or was cancelled. Funded bounties can't be deleted. */
  discard: artistProcedure.input(bountyId).mutation(({ ctx, input }) => discardUnfunded(ctx, ctx.artist, input.bountyId)),

  prepareFunding: artistProcedure.input(bountyId).mutation(({ ctx, input }) => prepareFunding(ctx, ctx.artist, ctx.session.user, input.bountyId)),
  submitFunding: artistProcedure.input(bountyId.extend({ xdr: z.string().min(1) })).mutation(({ ctx, input }) => submitFunding(ctx, ctx.artist, ctx.session.user, input.bountyId, input.xdr)),

  prepareWinner: artistProcedure
    .input(bountyId.extend({ winnerUserId: z.string().min(1), amount: z.string().trim().max(30) }))
    .mutation(({ ctx, input }) => prepareWinner(ctx, ctx.artist, ctx.session.user, input)),
  submitWinner: artistProcedure
    .input(bountyId.extend({ winnerUserId: z.string().min(1), amount: z.string().trim().max(30), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitWinner(ctx, ctx.artist, ctx.session.user, input)),

  searchTracks: artistProcedure.input(z.object({ query: z.string().trim().max(120) })).query(({ input }) => searchTracks(input.query)),
  topTracks: artistProcedure.input(z.object({ artist: z.string().trim().max(120) })).query(({ input }) => topTracks(input.artist)),
});
