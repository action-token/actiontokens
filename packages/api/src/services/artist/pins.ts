import { checkLayer } from "./layers";
import { lookColumnsFor, lookData, PIN_LOOK_SELECT } from "./pin-look";
import { toAmount, toStroops } from "@actiontokens/chain";
import {
  columnsToLook,
  resolvePinLook,
  type PinLookColumns,
  type PinLookInput,
} from "@actiontokens/ar-core/pin-look";
import type { PinType, Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import { randomLocation } from "@actiontokens/geo";
import { isOwnS3Url } from "@actiontokens/storage";

import type { Context } from "../../context";
import { webLink } from "./events";
import { invalid } from "./items";
import { creditLines, freeOf, openedStorage } from "./storage-withdraw";
import { notUnlockPin } from "../catalog/unlock-pins";

/**
 * Pins: reward drops the artist places on the map. A pin is one title, one
 * reward and one schedule, scattered over one or more spots; fans walk up to a
 * spot (or scan its QR) to collect, and claim the reward to their wallet later
 * (services/ar/claim). Pins go live the moment they are saved; admins can hide
 * one afterwards. Creating a pin is free.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export const MAX_SPOTS = 100;
export const MAX_RADIUS_METERS = 5000;
const MAX_CLAIMS = 100_000;
const MAX_TAGS = 10;

/** Who can collect it; DRAFT stays out because a hidden pin is already "not shown yet". */
export type PinVisibility = "PUBLIC" | "FOLLOWERS" | "SUBSCRIBERS" | "MEMBERS" | "TIER";

/** A fan-token reward gives `amount` per collect (default 1); an item always gives one copy. */
export type PinReward =
  { kind: "NONE" } | { kind: "FAN_TOKEN"; amount?: string } | { kind: "ITEM"; itemId: string };

const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;

export type PinInput = {
  title: string;
  description?: string;
  imageUrl?: string | null;
  link?: string | null;
  type: PinType;
  visibility: PinVisibility;
  /** Required for TIER: the tier whose token amount unlocks the pin */
  tierId?: string | null;
  reward: PinReward;
  /** How many fans can collect it; 0 = no limit (only without a reward) */
  claimLimit: number;
  startsAt: Date;
  endsAt: Date;
  /** Where the spots are scattered around */
  latitude: number;
  longitude: number;
  radiusMeters: number;
  spotCount: number;
  autoCollect: boolean;
  /** true = each spot can be collected separately; false = collecting any spot collects the pin */
  isMultiSpot: boolean;
  eventId?: string | null;
  /** Free-form labels; new ones are created on save */
  tags?: string[];
  /** The artist's map layer to put it in; left out or null is a regular pin */
  layerId?: string | null;
  /** How it looks on the maps; left out is the default (circle, the artist's picture) */
  look?: PinLookInput | null;
};

/** What an edit may change; where it is, how many spots and what it gives are fixed once created. */
export type UpdatePinInput = Partial<
  Pick<
    PinInput,
    | "title"
    | "description"
    | "imageUrl"
    | "link"
    | "type"
    | "visibility"
    | "tierId"
    | "claimLimit"
    | "startsAt"
    | "endsAt"
    | "autoCollect"
    | "isMultiSpot"
    | "eventId"
    | "tags"
    | "reward"
    | "layerId"
    | "look"
  >
> & { pinId: string };

/** IN_REVIEW and NOT_APPROVED come from the admin review: fans see a pin only once it is approved. */
export type PinStatus =
  "IN_REVIEW" | "NOT_APPROVED" | "HIDDEN" | "SCHEDULED" | "LIVE" | "ENDED" | "ALL_COLLECTED";

/** A tag as stored: lowercase and dashed so "Street Art" and "street art" are one tag. */
export const tagName = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "-");

export function cleanTags(labels: string[] | undefined) {
  const byName = new Map<string, string>();
  for (const raw of labels ?? []) {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    if (label.length > 40) throw invalid("Keep each tag under 40 characters.");
    byName.set(tagName(label), label);
  }
  if (byName.size > MAX_TAGS) throw invalid(`Use up to ${MAX_TAGS} tags.`);
  return [...byName].map(([name, label]) => ({ name, label }));
}

export function checkText(input: Partial<PinInput>) {
  const { title, description } = input;
  if (title !== undefined && (title.trim().length < 3 || title.trim().length > 100))
    throw invalid("Give the pin a title of 3 to 100 characters.");
  if (description !== undefined && description.length > 2000)
    throw invalid("Keep the description under 2000 characters.");
  if (input.imageUrl && !isOwnS3Url(input.imageUrl)) throw invalid("Upload the cover again.");
}

function checkPlace(
  input: Pick<PinInput, "latitude" | "longitude" | "radiusMeters" | "spotCount">,
  maxRadius = MAX_RADIUS_METERS,
) {
  if (!(input.latitude >= -90 && input.latitude <= 90))
    throw invalid("Latitude must be between -90 and 90.");
  if (!(input.longitude >= -180 && input.longitude <= 180))
    throw invalid("Longitude must be between -180 and 180.");
  if (!(input.radiusMeters >= 0 && input.radiusMeters <= maxRadius))
    throw invalid(`The radius can be up to ${maxRadius.toLocaleString("en-US")} metres.`);
  if (!Number.isInteger(input.spotCount) || input.spotCount < 1 || input.spotCount > MAX_SPOTS)
    throw invalid(`Place between 1 and ${MAX_SPOTS} spots.`);
}

function checkTimes(startsAt: Date, endsAt: Date, now: Date, creating: boolean) {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
    throw invalid("Pick a start and end time.");
  if (endsAt <= startsAt) throw invalid("The pin has to end after it starts.");
  if (creating && endsAt <= now) throw invalid("The end time is already in the past.");
}

/** TIER needs a tier of this artist; every other kind ignores it. */
export async function resolveTier(
  ctx: ServiceCtx,
  artist: ArtistRef,
  visibility: PinVisibility,
  tierId: string | null | undefined,
) {
  if (visibility !== "TIER") return null;
  if (!tierId) throw invalid("Pick the tier that can collect this pin.");
  const tier = await ctx.db.membershipTier.findFirst({
    where: { id: tierId, artistId: artist.id, isActive: true },
    select: { id: true },
  });
  if (!tier) throw invalid("That tier isn't available. Pick another.");
  return tier.id;
}

/**
 * The reward is one copy of an item per claim, sent from the artist's stock or
 * minted on demand, or an amount of the fan token, sent from storage. Either
 * way a reward needs a limit, and a capped item can't promise more than exists.
 */
export async function resolveReward(
  ctx: ServiceCtx,
  artist: ArtistRef,
  reward: PinReward,
  claimLimit: number,
) {
  if (!Number.isInteger(claimLimit) || claimLimit < 0 || claimLimit > MAX_CLAIMS)
    throw invalid("The collect limit must be a whole number.");
  if (reward.kind === "NONE")
    return { rewardItemId: null, rewardsFanToken: false, rewardAmount: "1" };
  if (claimLimit < 1)
    throw invalid("Set how many fans can collect it, since each one gets a reward.");

  if (reward.kind === "FAN_TOKEN") {
    const owner = await ctx.db.artist.findUnique({
      where: { id: artist.id },
      select: { fanTokenItemId: true },
    });
    if (!owner?.fanTokenItemId) throw invalid("Create your fan token first.");
    const amount = reward.amount?.trim() || "1";
    if (!AMOUNT.test(amount) || toStroops(amount) <= 0n)
      throw invalid("Enter how many tokens each fan gets, above zero.");
    return { rewardItemId: null, rewardsFanToken: true, rewardAmount: toAmount(toStroops(amount)) };
  }

  const item = await ctx.db.item.findFirst({
    where: {
      id: reward.itemId,
      artistId: artist.id,
      deletedAt: null,
      chainType: "CLASSIC_TOKEN",
      type: { notIn: ["FAN_TOKEN", "ROYALTY"] },
    },
    select: { id: true, title: true, supply: true },
  });
  if (!item) throw invalid("That reward isn't available. Pick another item.");
  if (item.supply !== null && claimLimit > item.supply)
    throw invalid(
      `${item.title} only has ${item.supply.toLocaleString("en-US")} copies, so up to that many fans can collect it.`,
    );
  return { rewardItemId: item.id, rewardsFanToken: false, rewardAmount: "1" };
}

async function resolveEvent(
  ctx: ServiceCtx,
  artist: ArtistRef,
  eventId: string | null | undefined,
) {
  if (!eventId) return null;
  const event = await ctx.db.event.findFirst({
    where: { id: eventId, artistId: artist.id },
    select: { id: true },
  });
  if (!event) throw invalid("That event isn't available. Pick another.");
  return event.id;
}

export const statusOf = (
  pin: {
    approval: "PENDING" | "APPROVED" | "REJECTED";
    isHidden: boolean;
    startsAt: Date;
    endsAt: Date;
    claimLimit: number;
    claimsLeft: number;
  },
  now: Date,
): PinStatus => {
  if (pin.approval === "REJECTED") return "NOT_APPROVED";
  if (pin.approval === "PENDING") return "IN_REVIEW";
  if (pin.isHidden) return "HIDDEN";
  if (pin.endsAt < now) return "ENDED";
  if (pin.startsAt > now) return "SCHEDULED";
  return pin.claimLimit > 0 && pin.claimsLeft === 0 ? "ALL_COLLECTED" : "LIVE";
};

async function ownPin(ctx: ServiceCtx, artist: ArtistRef, pinId: string) {
  const pin = await ctx.db.pin.findFirst({
    where: { id: pinId, artistId: artist.id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      claimLimit: true,
      claimsLeft: true,
      rewardItemId: true,
      rewardsFanToken: true,
      rewardAmount: true,
      visibility: true,
      tierId: true,
      layerId: true,
    },
  });
  if (!pin) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Pin not found" });
  ctx.activity.set({ targetType: "Pin", targetId: pin.id });
  return pin;
}

const claimsOn = (db: ServiceCtx["db"], where: Prisma.PinClaimWhereInput) =>
  db.pinClaim.count({ where });

/** The things the form offers to pick from, plus what the artist has tagged before. */
export async function pinOptions(
  ctx: Pick<Context, "db" | "chain">,
  artist: ArtistRef & { storageAccountId: string | null },
) {
  const [items, tiers, events, tags, owner] = await Promise.all([
    ctx.db.item.findMany({
      where: {
        artistId: artist.id,
        deletedAt: null,
        chainType: "CLASSIC_TOKEN",
        type: { notIn: ["FAN_TOKEN", "ROYALTY"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, coverUrl: true, supply: true },
    }),
    ctx.db.membershipTier.findMany({
      where: { artistId: artist.id, isActive: true },
      orderBy: { requiredTokens: "asc" },
      select: { id: true, name: true, requiredTokens: true },
    }),
    ctx.db.event.findMany({
      where: { artistId: artist.id, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true },
    }),
    ctx.db.pinTag.findMany({
      where: {
        OR: [{ artistId: artist.id }, { pins: { some: { pin: { artistId: artist.id } } } }],
      },
      orderBy: { label: "asc" },
      select: { label: true },
    }),
    ctx.db.artist.findUnique({
      where: { id: artist.id },
      select: {
        avatarUrl: true,
        fanTokenItem: {
          select: {
            title: true,
            coverUrl: true,
            classicToken: { select: { code: true, issuer: true } },
          },
        },
      },
    }),
  ]);
  const token = owner?.fanTokenItem?.classicToken ?? null;
  return {
    items,
    tiers: tiers.map((tier) => ({ ...tier, requiredTokens: tier.requiredTokens.toString() })),
    events,
    tags: tags.map((tag) => tag.label),
    /** The artist's picture, for the pin look preview */
    artistImage: owner?.avatarUrl ?? null,
    fanToken: owner?.fanTokenItem
      ? {
          title: owner.fanTokenItem.title,
          coverUrl: owner.fanTokenItem.coverUrl,
          code: token?.code ?? null,
          inStorage: await fanTokensInStorage(ctx, artist, token),
        }
      : null,
  };
}

/** How many fan tokens storage holds for pin rewards; null when storage isn't open or can't be read. */
async function fanTokensInStorage(
  ctx: Pick<Context, "db" | "chain">,
  artist: { storageAccountId: string | null },
  token: { code: string; issuer: string } | null,
) {
  const storage = await openedStorage(ctx, artist);
  if (!storage || !token) return null;
  // A failed read says nothing rather than "0": the form only shows what it knows.
  const account = await ctx.chain.loadAccount(storage.publicKey).catch(() => undefined);
  if (account === undefined) return null;
  const line = creditLines(account).find(
    (entry) => entry.asset_code === token.code && entry.asset_issuer === token.issuer,
  );
  return toAmount(line ? freeOf(line) : 0n);
}

const fanTokenLabel = (amount: { toString(): string }) => {
  const count = Number(amount.toString());
  return count === 1
    ? "1 fan token"
    : `${count.toLocaleString("en-US", { maximumFractionDigits: 7 })} fan tokens`;
};

export async function listPins(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef, now = new Date()) {
  const rows = await ctx.db.pin.findMany({
    where: { artistId: artist.id, ...notUnlockPin },
    orderBy: { createdAt: "desc" },
    include: {
      rewardItem: { select: { title: true, coverUrl: true } },
      event: { select: { title: true } },
      layer: { select: { id: true, name: true, icon: true, color: true } },
      pinShape: PIN_LOOK_SELECT.pinShape,
      artist: { select: { avatarUrl: true } },
      tags: { select: { tag: { select: { label: true } } } },
      spots: {
        where: { isHidden: false },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          autoCollect: true,
          _count: { select: { claims: true } },
        },
      },
    },
  });
  return rows.map((pin) => ({
    id: pin.id,
    title: pin.title,
    imageUrl: pin.imageUrl,
    type: pin.type,
    visibility: pin.visibility,
    startsAt: pin.startsAt,
    endsAt: pin.endsAt,
    claimLimit: pin.claimLimit,
    claimsLeft: pin.claimsLeft,
    latitude: pin.latitude,
    longitude: pin.longitude,
    status: statusOf(pin, now),
    spots: pin.spots.length,
    /** Where each spot is, for the map */
    spotPoints: pin.spots.map((spot) => ({
      id: spot.id,
      latitude: spot.latitude,
      longitude: spot.longitude,
      autoCollect: spot.autoCollect,
      collected: spot._count.claims,
    })),
    autoCollect: pin.spots.some((spot) => spot.autoCollect),
    collected: pin.spots.reduce((sum, spot) => sum + spot._count.claims, 0),
    reward: pin.rewardItem?.title ?? (pin.rewardsFanToken ? fanTokenLabel(pin.rewardAmount) : null),
    event: pin.event?.title ?? null,
    layer: pin.layer,
    look: resolvePinLook(pin, {
      customShape: pin.pinShape,
      artistImage: pin.artist.avatarUrl,
      pinImage: pin.imageUrl,
      autoCollect: pin.spots.some((spot) => spot.autoCollect),
    }),
    tags: pin.tags.map((link) => link.tag.label),
  }));
}

export async function getPin(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  pinId: string,
  now = new Date(),
) {
  const pin = await ctx.db.pin.findFirst({
    where: { id: pinId, artistId: artist.id },
    include: {
      rewardItem: { select: { title: true } },
      tags: { select: { tag: { select: { label: true } } } },
      spots: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          isHidden: true,
          autoCollect: true,
          _count: { select: { claims: true } },
        },
      },
    },
  });
  if (!pin) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Pin not found" });
  const spots = pin.spots.map(({ _count, ...spot }) => ({ ...spot, collected: _count.claims }));
  const collected = spots.reduce((sum, spot) => sum + spot.collected, 0);
  return {
    id: pin.id,
    title: pin.title,
    description: pin.description ?? "",
    imageUrl: pin.imageUrl,
    link: pin.link,
    type: pin.type,
    visibility: pin.visibility as PinVisibility,
    tierId: pin.tierId,
    reward: (pin.rewardItemId
      ? { kind: "ITEM", itemId: pin.rewardItemId, title: pin.rewardItem?.title ?? "" }
      : pin.rewardsFanToken
        ? { kind: "FAN_TOKEN", amount: pin.rewardAmount.toString() }
        : { kind: "NONE" }) as
      | { kind: "NONE" }
      | { kind: "FAN_TOKEN"; amount: string }
      | { kind: "ITEM"; itemId: string; title: string },
    claimLimit: pin.claimLimit,
    claimsLeft: pin.claimsLeft,
    startsAt: pin.startsAt,
    endsAt: pin.endsAt,
    latitude: pin.latitude,
    longitude: pin.longitude,
    radiusMeters: pin.radiusMeters,
    autoCollect: spots.some((spot) => spot.autoCollect),
    isMultiSpot: pin.isMultiSpot,
    isHidden: pin.isHidden,
    eventId: pin.eventId,
    layerId: pin.layerId,
    look: columnsToLook(pin),
    tags: pin.tags.map((link) => link.tag.label),
    status: statusOf(pin, now),
    collected,
    spots,
  };
}

/**
 * A hotspot's drop: its spots are already placed inside the hotspot's area
 * (which may be wider than a pin's circle), and it goes live without admin
 * review, as bandfan's drops did.
 */
export type HotspotDrop = {
  hotspotId?: string;
  spots: { latitude: number; longitude: number }[];
  maxRadius: number;
  /** The hotspot's look, copied onto the drop */
  look?: PinLookColumns;
};

export async function createPin(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: PinInput,
  now = new Date(),
  drop?: HotspotDrop,
  /** `live`: skips the admin review (hotspot drops, and batches the artist confirmed). */
  options: { live?: boolean } = {},
) {
  checkText(input);
  checkPlace(input, drop?.maxRadius);
  checkTimes(input.startsAt, input.endsAt, now, true);
  const link = input.link?.trim() ? webLink(input.link.trim(), "The link") : null;
  const tierId = await resolveTier(ctx, artist, input.visibility, input.tierId);
  const reward = await resolveReward(ctx, artist, input.reward, input.claimLimit);
  const eventId = await resolveEvent(ctx, artist, input.eventId);
  const tags = cleanTags(input.tags);
  const layerId = (await checkLayer(ctx.db, artist.id, input.layerId)) ?? null;
  const look = drop?.look ?? (await lookColumnsFor(ctx.db, artist.id, input.look));

  const pin = await ctx.db.$transaction(async (tx) => {
    const created = await tx.pin.create({
      data: {
        artistId: artist.id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        imageUrl: input.imageUrl || null,
        link,
        type: input.type,
        visibility: input.visibility,
        tierId,
        ...reward,
        claimLimit: input.claimLimit,
        claimsLeft: input.claimLimit,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMeters: input.radiusMeters,
        isMultiSpot: input.isMultiSpot,
        eventId,
        // Waits for an admin, as in Wadzzo: fans see it once it is approved.
        // A hotspot's drops don't (the artist chose the area once).
        approval: drop || options.live ? "APPROVED" : "PENDING",
        hotspotId: drop?.hotspotId ?? null,
        layerId,
        ...(look ? lookData(look) : {}),
        spots: {
          createMany: {
            data: (
              drop?.spots ??
              Array.from({ length: input.spotCount }, () =>
                randomLocation(input.latitude, input.longitude, input.radiusMeters),
              )
            ).map((spot) => ({
              latitude: spot.latitude,
              longitude: spot.longitude,
              autoCollect: input.autoCollect,
            })),
          },
        },
      },
      select: { id: true },
    });
    await linkTags(tx, artist, created.id, tags);
    return created;
  });
  ctx.activity.set({ targetType: "Pin", targetId: pin.id });
  return { pinId: pin.id };
}

async function linkTags(
  tx: Pick<ServiceCtx["db"], "pinTag" | "pinTagLink">,
  artist: ArtistRef,
  pinId: string,
  tags: { name: string; label: string }[],
) {
  await tx.pinTagLink.deleteMany({ where: { pinId } });
  if (tags.length === 0) return;
  // A tag name is shared by everyone, so an existing one is reused whoever made it.
  const stored = await Promise.all(
    tags.map((tag) =>
      tx.pinTag.upsert({
        where: { name: tag.name },
        create: { ...tag, artistId: artist.id },
        update: {},
        select: { id: true },
      }),
    ),
  );
  await tx.pinTagLink.createMany({
    data: stored.map((tag) => ({ pinId, tagId: tag.id })),
    skipDuplicates: true,
  });
}

export async function updatePin(ctx: ServiceCtx, artist: ArtistRef, input: UpdatePinInput) {
  const pin = await ownPin(ctx, artist, input.pinId);
  checkText(input);
  checkTimes(input.startsAt ?? pin.startsAt, input.endsAt ?? pin.endsAt, new Date(), false);

  const claimed = await claimsOn(ctx.db, { spot: { pinId: pin.id } });
  const claimLimit = input.claimLimit ?? pin.claimLimit;
  if (claimLimit > 0 && claimLimit < claimed)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `${claimed} fans have already collected it. The limit can't go below that.`,
    });

  const data: Prisma.PinUpdateInput = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim() || null;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;
  if (input.link !== undefined)
    data.link = input.link?.trim() ? webLink(input.link.trim(), "The link") : null;
  if (input.type !== undefined) data.type = input.type;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;
  if (input.isMultiSpot !== undefined) data.isMultiSpot = input.isMultiSpot;

  if (input.visibility !== undefined || input.tierId !== undefined) {
    const visibility = input.visibility ?? (pin.visibility as PinVisibility);
    const tierId = await resolveTier(ctx, artist, visibility, input.tierId ?? pin.tierId);
    data.visibility = visibility;
    data.tier = tierId ? { connect: { id: tierId } } : { disconnect: true };
  }

  if (input.eventId !== undefined) {
    const eventId = await resolveEvent(ctx, artist, input.eventId);
    data.event = eventId ? { connect: { id: eventId } } : { disconnect: true };
  }

  if (input.reward !== undefined || input.claimLimit !== undefined) {
    const current: PinReward = pin.rewardItemId
      ? { kind: "ITEM", itemId: pin.rewardItemId }
      : pin.rewardsFanToken
        ? { kind: "FAN_TOKEN", amount: pin.rewardAmount.toString() }
        : { kind: "NONE" };
    const next = input.reward ?? current;
    const same = (a: PinReward, b: PinReward) =>
      a.kind === "FAN_TOKEN" && b.kind === "FAN_TOKEN"
        ? toStroops(a.amount?.trim() || "1") === toStroops(b.amount?.trim() || "1")
        : JSON.stringify(a) === JSON.stringify(b);
    const changed = !same(next, current);
    if (changed && claimed > 0)
      throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
        message: "Fans have already collected this pin, so its reward can't change.",
      });
    const reward = await resolveReward(ctx, artist, next, claimLimit);
    data.rewardItem = reward.rewardItemId
      ? { connect: { id: reward.rewardItemId } }
      : { disconnect: true };
    data.rewardsFanToken = reward.rewardsFanToken;
    data.rewardAmount = reward.rewardAmount;
    data.claimLimit = claimLimit;
    data.claimsLeft = claimLimit > 0 ? claimLimit - claimed : 0;
  }

  const layerId = await checkLayer(ctx.db, artist.id, input.layerId, pin.layerId);
  if (layerId !== undefined)
    data.layer = layerId ? { connect: { id: layerId } } : { disconnect: true };
  const look = await lookColumnsFor(ctx.db, artist.id, input.look);
  if (look) {
    const { pinShapeId, ...rest } = lookData(look);
    Object.assign(data, rest);
    data.pinShape = pinShapeId ? { connect: { id: pinShapeId } } : { disconnect: true };
  }

  const tags = input.tags === undefined ? null : cleanTags(input.tags);
  await ctx.db.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) await tx.pin.update({ where: { id: pin.id }, data });
    if (input.autoCollect !== undefined)
      await tx.pinSpot.updateMany({
        where: { pinId: pin.id },
        data: { autoCollect: input.autoCollect },
      });
    if (tags) await linkTags(tx, artist, pin.id, tags);
  });
  return { pinId: pin.id };
}

/** Hide a pin from the map without losing it or what fans collected. */
export async function setPinHidden(
  ctx: ServiceCtx,
  artist: ArtistRef,
  pinId: string,
  hidden: boolean,
) {
  const pin = await ownPin(ctx, artist, pinId);
  await ctx.db.pin.update({ where: { id: pin.id }, data: { isHidden: hidden } });
  return { pinId: pin.id, hidden };
}

/** Only a pin nobody collected can be deleted; after that it can only be hidden. */
export async function removePin(ctx: ServiceCtx, artist: ArtistRef, pinId: string) {
  const pin = await ownPin(ctx, artist, pinId);
  const claimed = await claimsOn(ctx.db, { spot: { pinId: pin.id } });
  if (claimed > 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `${claimed} fans have collected this pin. Hide it instead.`,
    });
  await ctx.db.pin.delete({ where: { id: pin.id } });
  return { pinId: pin.id };
}

/** Takes one spot off the map; a spot fans already collected is hidden rather than erased. */
export async function removeSpot(ctx: ServiceCtx, artist: ArtistRef, spotId: string) {
  const spot = await ctx.db.pinSpot.findFirst({
    where: { id: spotId, pin: { artistId: artist.id } },
    select: { id: true, pinId: true, isHidden: true, _count: { select: { claims: true } } },
  });
  if (!spot) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Spot not found" });
  ctx.activity.set({ targetType: "Pin", targetId: spot.pinId });
  const visible = await ctx.db.pinSpot.count({ where: { pinId: spot.pinId, isHidden: false } });
  if (!spot.isHidden && visible <= 1)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "A pin needs at least one spot. Hide or delete the pin instead.",
    });
  if (spot._count.claims > 0)
    await ctx.db.pinSpot.update({ where: { id: spot.id }, data: { isHidden: true } });
  else await ctx.db.pinSpot.delete({ where: { id: spot.id } });
  return { pinId: spot.pinId };
}

function checkPoint(latitude: number, longitude: number) {
  if (!(latitude >= -90 && latitude <= 90)) throw invalid("Latitude must be between -90 and 90.");
  if (!(longitude >= -180 && longitude <= 180))
    throw invalid("Longitude must be between -180 and 180.");
}

async function ownSpot(ctx: ServiceCtx, artist: ArtistRef, spotId: string) {
  const spot = await ctx.db.pinSpot.findFirst({
    where: { id: spotId, pin: { artistId: artist.id } },
    select: { id: true, pinId: true, autoCollect: true },
  });
  if (!spot) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Spot not found" });
  ctx.activity.set({ targetType: "Pin", targetId: spot.pinId });
  return spot;
}

/** Copies a spot to another place on the map: the same pin, a new spot (and QR code) of its own. */
export async function addSpot(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { spotId: string; latitude: number; longitude: number },
) {
  checkPoint(input.latitude, input.longitude);
  const spot = await ownSpot(ctx, artist, input.spotId);
  const visible = await ctx.db.pinSpot.count({ where: { pinId: spot.pinId, isHidden: false } });
  if (visible >= MAX_SPOTS) throw invalid(`A pin can have up to ${MAX_SPOTS} spots.`);
  const created = await ctx.db.pinSpot.create({
    data: {
      pinId: spot.pinId,
      latitude: input.latitude,
      longitude: input.longitude,
      autoCollect: spot.autoCollect,
    },
    select: { id: true },
  });
  return { pinId: spot.pinId, spotId: created.id };
}

/** Moves a spot; what fans collected there stays collected. */
export async function moveSpot(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { spotId: string; latitude: number; longitude: number },
) {
  checkPoint(input.latitude, input.longitude);
  const spot = await ownSpot(ctx, artist, input.spotId);
  await ctx.db.pinSpot.update({
    where: { id: spot.id },
    data: { latitude: input.latitude, longitude: input.longitude },
  });
  return { pinId: spot.pinId, spotId: spot.id };
}
