import { AppError, ErrorCodes } from "@actiontokens/errors";
import { validatePrice } from "@actiontokens/utils/asset-code";

import type { Context } from "../../context";
import {
  needsTokenSetup,
  PRIZE_CURRENCIES,
  type PrizeCurrency,
  prizeFieldsFor,
  prizeView,
} from "../bounty/prize";
import { webLink } from "./events";
import { invalid } from "./items";

/**
 * Bounties, the artist's side: write one, fund its prize into escrow, watch
 * fans join and submit, pick winners. Same rules as the old Bandcoin: the prize
 * and who it is paid to can't change once funded; the text, instructions and
 * listening rules can. Funding and winner picks are in bounty-escrow.ts.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; storageAccountId: string | null };

export { PRIZE_CURRENCIES, type PrizeCurrency } from "../bounty/prize";

const MAX_INSTRUCTIONS = 10;
const MAX_TRACKS = 5;
const MAX_WINNERS = 100;

export type TrackInput = {
  title: string;
  artistName: string;
  albumName?: string | null;
  albumArtUrl?: string | null;
  durationSec: number;
  /** Plays a fan needs to reach for this track */
  targetPlays: number;
  lastFmUrl: string;
  spotifyUrl?: string | null;
  youtubeUrl?: string | null;
};

export type MusicInput = {
  mode: "MUSIC_ONLY" | "HYBRID";
  ruleType: "ALL" | "ANY_N" | "TOTAL_PLAYS";
  requiredTracks?: number | null;
  totalPlays?: number | null;
  tracks: TrackInput[];
};

/** What can be edited at any time. */
export type BountyText = {
  title: string;
  summary: string;
  description: string;
  rewardNote?: string | null;
  instructions: string[];
  requiresActionCam: boolean;
  eventId?: string | null;
  music?: MusicInput | null;
};

export type BountyInput = BountyText & {
  /** A decimal amount of whole tokens, like "250" or "12.5" */
  prizeAmount: string;
  /** One of the platform's currencies, or `prizeAsset` for any other asset the artist holds */
  prizeCurrency?: PrizeCurrency;
  prizeAsset?: { code: string; issuer: string };
  maxWinners: number;
  /** Fund from the artist's storage account instead of their own wallet */
  fundedFromStorage: boolean;
};

function checkText(input: Partial<BountyText>) {
  if (input.title !== undefined && (input.title.trim().length === 0 || input.title.length > 120))
    throw invalid("Give the bounty a title of up to 120 characters.");
  if (input.summary !== undefined && input.summary.length > 600)
    throw invalid("Keep the summary under 600 characters.");
  if (input.description !== undefined && input.description.length > 6000)
    throw invalid("Keep the description under 6000 characters.");
  if (input.rewardNote && input.rewardNote.length > 600)
    throw invalid("Keep the reward note under 600 characters.");
  if (input.instructions !== undefined) {
    if (input.instructions.length > MAX_INSTRUCTIONS)
      throw invalid(`Use at most ${MAX_INSTRUCTIONS} instructions.`);
    if (input.instructions.some((line) => line.trim().length === 0 || line.length > 200))
      throw invalid("Each instruction needs 1 to 200 characters.");
  }
}

/** Fans need something to submit unless the whole challenge is listening. */
function checkInstructions(instructions: string[], musicOnly: boolean) {
  if (!musicOnly && instructions.length === 0)
    throw invalid("Add at least one submission instruction.");
}

function checkMusic(music: MusicInput | null | undefined) {
  if (music) {
    if (music.tracks.length === 0) throw invalid("Add at least one track for the music challenge.");
    if (music.tracks.length > MAX_TRACKS) throw invalid(`Use at most ${MAX_TRACKS} tracks.`);
    for (const track of music.tracks) {
      if (track.title.trim().length === 0 || track.artistName.trim().length === 0)
        throw invalid("Every track needs a title and an artist.");
      if (!Number.isInteger(track.targetPlays) || track.targetPlays < 1 || track.targetPlays > 1000)
        throw invalid("Plays per track must be a whole number from 1 to 1000.");
      if (!Number.isInteger(track.durationSec) || track.durationSec < 1 || track.durationSec > 7200)
        throw invalid("A track's length must be between 1 second and 2 hours.");
      webLink(track.lastFmUrl, "The Last.fm link");
      if (track.spotifyUrl) webLink(track.spotifyUrl, "The Spotify link");
      if (track.youtubeUrl) webLink(track.youtubeUrl, "The YouTube link");
      if (track.albumArtUrl) webLink(track.albumArtUrl, "The album art address");
    }
    if (music.ruleType === "ANY_N") {
      const needed = music.requiredTracks ?? 0;
      if (!Number.isInteger(needed) || needed < 1 || needed > music.tracks.length)
        throw invalid("Choose how many of the tracks fans must listen to.");
    }
    if (music.ruleType === "TOTAL_PLAYS") {
      const total = music.totalPlays ?? 0;
      if (!Number.isInteger(total) || total < 1)
        throw invalid("Choose the total number of plays fans must reach.");
    }
  }
}

const trackData = (track: TrackInput) => ({
  title: track.title.trim(),
  artistName: track.artistName.trim(),
  albumName: track.albumName?.trim() || null,
  albumArtUrl: track.albumArtUrl || null,
  durationSec: track.durationSec,
  targetPlays: track.targetPlays,
  lastFmUrl: track.lastFmUrl,
  spotifyUrl: track.spotifyUrl || null,
  youtubeUrl: track.youtubeUrl || null,
});

const ruleData = (music: MusicInput) => ({
  mode: music.mode,
  ruleType: music.ruleType,
  requiredTracks: music.ruleType === "ANY_N" ? music.requiredTracks : null,
  totalPlays: music.ruleType === "TOTAL_PLAYS" ? music.totalPlays : null,
});

async function ownEvent(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  eventId: string | null | undefined,
) {
  if (!eventId) return null;
  const event = await ctx.db.event.findFirst({
    where: { id: eventId, organizationId: artist.id },
    select: { id: true },
  });
  if (!event) throw invalid("That event isn't one of yours.");
  return event.id;
}

export async function ownBounty(
  ctx: Pick<ServiceCtx, "db" | "activity">,
  artist: Pick<ArtistRef, "id">,
  bountyId: string,
) {
  const bounty = await ctx.db.bounty.findFirst({
    where: { id: bountyId, organizationId: artist.id },
    select: {
      id: true,
      fundTxHash: true,
      status: true,
      prizeAmount: true,
      prizeCurrency: true,
      prizeAssetCode: true,
      prizeAssetIssuer: true,
      maxWinners: true,
      fundedFromStorage: true,
      escrowContractId: true,
    },
  });
  if (!bounty) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Bounty not found" });
  ctx.activity.set({ targetType: "Bounty", targetId: bounty.id });
  return bounty;
}

/**
 * Saves the bounty as an unfunded draft. Fans only see it once its prize is
 * in escrow (see bounty-escrow.ts), so a draft that never gets funded is
 * invisible and can be discarded.
 */
export async function createBounty(ctx: ServiceCtx, artist: ArtistRef, input: BountyInput) {
  const escrow = ctx.chain.config.escrowContract;
  if (!escrow)
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Bounties aren't set up yet." });
  checkText(input);
  const problem = validatePrice(input.prizeAmount);
  if (problem) throw invalid(`The prize: ${problem}`);
  const prize = prizeFieldsFor(
    { currency: input.prizeCurrency, asset: input.prizeAsset },
    ctx.chain.config.assets,
  );
  if (
    !prize ||
    (prize.prizeCurrency && !PRIZE_CURRENCIES.includes(prize.prizeCurrency as PrizeCurrency))
  )
    throw invalid("Choose what the prize is paid in.");
  if (
    prize.prizeAssetCode &&
    !(await ctx.chain.assetExists(prize.prizeAssetCode, prize.prizeAssetIssuer!))
  )
    throw invalid("That asset isn't on Stellar. Pick one you hold.");
  if (!Number.isInteger(input.maxWinners) || input.maxWinners < 1 || input.maxWinners > MAX_WINNERS)
    throw invalid(`Choose 1 to ${MAX_WINNERS} winners.`);
  checkInstructions(input.instructions, input.music?.mode === "MUSIC_ONLY");
  checkMusic(input.music);
  if (input.fundedFromStorage && !artist.storageAccountId)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "You don't have a storage account to fund from.",
    });
  const eventId = await ownEvent(ctx, artist, input.eventId);

  const bounty = await ctx.db.bounty.create({
    data: {
      organizationId: artist.id,
      title: input.title.trim(),
      summary: input.summary.trim(),
      description: input.description.trim(),
      instructions:
        input.music?.mode === "MUSIC_ONLY" ? [] : input.instructions.map((line) => line.trim()),
      ...prize,
      prizeAmount: input.prizeAmount,
      rewardNote: input.rewardNote?.trim() || null,
      maxWinners: input.maxWinners,
      escrowContractId: escrow,
      fundedFromStorage: input.fundedFromStorage,
      requiresActionCam: input.requiresActionCam,
      eventId,
      ...(input.music
        ? {
            musicRule: {
              create: {
                ...ruleData(input.music),
                tracks: { create: input.music.tracks.map(trackData) },
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Bounty", targetId: bounty.id });
  return { bountyId: bounty.id, tokenSetup: await needsTokenSetup(ctx.chain, prize) };
}

/**
 * Edit what fans read and the listening rules. The prize, its currency, the
 * number of winners and where it was funded from are fixed once the bounty exists.
 * Changing the tracks starts every fan's listening progress over, as before.
 */
export async function updateBounty(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: Partial<BountyText> & { bountyId: string },
) {
  const bounty = await ownBounty(ctx, artist, input.bountyId);
  checkText(input);
  const current = await ctx.db.bounty.findUniqueOrThrow({
    where: { id: bounty.id },
    select: { instructions: true, musicRule: { select: { mode: true } } },
  });
  const musicOnly =
    (input.music === undefined ? current.musicRule?.mode : input.music?.mode) === "MUSIC_ONLY";
  checkInstructions(input.instructions ?? current.instructions, musicOnly);
  if (input.music !== undefined) checkMusic(input.music);
  const eventId =
    input.eventId === undefined ? undefined : await ownEvent(ctx, artist, input.eventId);

  const data = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.summary !== undefined ? { summary: input.summary.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.rewardNote !== undefined ? { rewardNote: input.rewardNote?.trim() || null } : {}),
    ...(input.instructions !== undefined
      ? { instructions: musicOnly ? [] : input.instructions.map((line) => line.trim()) }
      : {}),
    ...(input.requiresActionCam !== undefined
      ? { requiresActionCam: input.requiresActionCam }
      : {}),
    ...(eventId !== undefined ? { eventId } : {}),
  };
  await ctx.db.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) await tx.bounty.update({ where: { id: bounty.id }, data });
    if (input.music === undefined) return;
    if (input.music === null) {
      await tx.bountyMusicRule.deleteMany({ where: { bountyId: bounty.id } });
      return;
    }
    await tx.bountyTrackProgress.deleteMany({ where: { participant: { bountyId: bounty.id } } });
    await tx.bountyTrack.deleteMany({ where: { bountyId: bounty.id } });
    await tx.bountyMusicRule.upsert({
      where: { bountyId: bounty.id },
      create: {
        bountyId: bounty.id,
        ...ruleData(input.music),
        tracks: { create: input.music.tracks.map(trackData) },
      },
      update: { ...ruleData(input.music), tracks: { create: input.music.tracks.map(trackData) } },
    });
  });
  return { bountyId: bounty.id };
}

export async function setBountyStatus(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { bountyId: string; status: "RUNNING" | "PAUSED" | "COMPLETED" },
) {
  const bounty = await ownBounty(ctx, artist, input.bountyId);
  if (!bounty.fundTxHash)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Fund the bounty first." });
  await ctx.db.bounty.update({ where: { id: bounty.id }, data: { status: input.status } });
  return { bountyId: bounty.id };
}

/** A draft that was never funded can be thrown away; a funded bounty can't. */
export async function discardUnfunded(ctx: ServiceCtx, artist: ArtistRef, bountyId: string) {
  const bounty = await ownBounty(ctx, artist, bountyId);
  if (bounty.fundTxHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "A funded bounty can't be deleted.",
    });
  await ctx.db.bounty.delete({ where: { id: bounty.id } });
  return { bountyId: bounty.id };
}

export async function listBounties(
  ctx: Pick<ServiceCtx, "db" | "chain">,
  artist: Pick<ArtistRef, "id">,
) {
  const rows = await ctx.db.bounty.findMany({
    where: { organizationId: artist.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, submissions: true, winners: true } },
      musicRule: { select: { mode: true } },
    },
  });
  return rows.map(({ _count, fundTxHash, prizeAmount, musicRule, ...row }) => ({
    ...row,
    prizeAmount: prizeAmount.toString(),
    prize: prizeView({ ...row, prizeAmount }, ctx.chain.config),
    funded: fundTxHash !== null,
    hasMusic: musicRule !== null,
    participants: _count.participants,
    submissions: _count.submissions,
    winners: _count.winners,
  }));
}

const person = {
  select: { id: true, username: true, displayName: true, avatarUrl: true, walletAddress: true },
} as const;

/** One bounty with everything the artist manages it by. */
export async function getBounty(
  ctx: Pick<ServiceCtx, "db" | "chain">,
  artist: Pick<ArtistRef, "id">,
  bountyId: string,
) {
  const bounty = await ctx.db.bounty.findFirst({
    where: { id: bountyId, organizationId: artist.id },
    include: {
      musicRule: { include: { tracks: { orderBy: { createdAt: "asc" } } } },
      winners: { include: { user: person }, orderBy: { selectedAt: "asc" } },
      _count: { select: { participants: true, submissions: true } },
    },
  });
  if (!bounty) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Bounty not found" });
  const awarded = bounty.winners.reduce((sum, winner) => sum + Number(winner.prizeAmount), 0);
  const { _count, fundTxHash, prizeAmount, winners, ...row } = bounty;
  return {
    ...row,
    funded: fundTxHash !== null,
    fundTxHash,
    prizeAmount: prizeAmount.toString(),
    prize: prizeView({ ...row, prizeAmount }, ctx.chain.config),
    /** A prize in a token whose contract isn't deployed yet: set it up before funding */
    tokenSetup: fundTxHash === null && (await needsTokenSetup(ctx.chain, row)),
    awarded: String(awarded),
    winners: winners.map((winner) => ({ ...winner, prizeAmount: winner.prizeAmount.toString() })),
    participants: _count.participants,
    submissions: _count.submissions,
  };
}

/** Everyone who joined, with how far through the listening rules they are. */
export async function listParticipants(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  bountyId: string,
) {
  const bounty = await ctx.db.bounty.findFirst({
    where: { id: bountyId, organizationId: artist.id },
    select: { musicRule: { select: { tracks: { select: { id: true } } } } },
  });
  if (!bounty) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Bounty not found" });
  const totalTracks = bounty.musicRule?.tracks.length ?? 0;
  const rows = await ctx.db.bountyParticipant.findMany({
    where: { bountyId },
    include: { user: person, trackProgress: true },
    orderBy: { joinedAt: "desc" },
  });
  return rows.map(({ trackProgress, ...row }) => {
    const satisfiedCount = trackProgress.filter((progress) => progress.isSatisfied).length;
    return {
      ...row,
      satisfiedCount,
      totalTracks,
      progressPct: totalTracks > 0 ? Math.round((satisfiedCount / totalTracks) * 100) : 0,
    };
  });
}

/** The reports fans sent in, newest first, with their files and Action Cam captures. */
export async function listSubmissions(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  bountyId: string,
) {
  const bounty = await ctx.db.bounty.findFirst({
    where: { id: bountyId, organizationId: artist.id },
    select: { id: true },
  });
  if (!bounty) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Bounty not found" });
  return ctx.db.bountySubmission.findMany({
    where: { bountyId },
    include: { user: person, attachments: true, captures: true },
    orderBy: { createdAt: "desc" },
  });
}
