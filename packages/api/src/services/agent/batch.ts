import { randomLocation } from "@bandcoin/geo";

import type { Context } from "../../context";
import { enqueueJob } from "../jobs/queue";
import { createPin, MAX_RADIUS_METERS, type PinInput } from "../artist/pins";
import { UNLIMITED_COLLECTIONS, type PinDefaults } from "./contract";

/**
 * Batch pins: the places an artist confirmed on an agent card, made as pins in
 * the background. Each pin goes live without admin review (the artist already
 * confirmed it, and an admin can still hide any pin). One place failing doesn't
 * stop the others; nothing is retried, since a retry would double the pins.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export const BATCH_JOB = "pins.batch";
export const MAX_BATCH = 200;
const PROGRESS_EVERY = 5;
/** A batch with no progress for this long was lost (the worker restarted). */
export const BATCH_STALL_MS = 10 * 60_000;

export type BatchPlace = {
  id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  url?: string;
  image?: string;
  gPlaceId?: string;
};

export type BatchPayload = {
  places: BatchPlace[];
  options: Pick<
    PinDefaults,
    "type" | "autoCollect" | "pinNumber" | "radius" | "collectionLimit" | "grouping"
  >;
};

export type BatchLog = { title: string; status: "ok" | "error"; error?: string };

/** What the worker adds: a photo and link for a Google place, and search tags for the first pin. */
export type BatchDeps = {
  enrich?: (place: BatchPlace) => Promise<BatchPlace>;
  tags?: (place: BatchPlace) => Promise<string[]>;
};

export async function startPinBatch(ctx: ServiceCtx, artist: ArtistRef, payload: BatchPayload) {
  const job = await ctx.db.pinBatchJob.create({
    data: {
      artistId: artist.id,
      status: "QUEUED",
      total: payload.places.length,
      payload,
      redeemMode: payload.options.grouping,
    },
    select: { id: true },
  });
  await enqueueJob(ctx.db, BATCH_JOB, { batchId: job.id }, { maxAttempts: 1 });
  ctx.activity.set({
    targetType: "PinBatchJob",
    targetId: job.id,
    amount: String(payload.places.length),
  });
  return { pinJobId: job.id };
}

const limitOf = (collectionLimit: number) =>
  collectionLimit >= UNLIMITED_COLLECTIONS ? 0 : collectionLimit;

function pinInput(place: BatchPlace, options: BatchPayload["options"], tags: string[]): PinInput {
  return {
    title: place.title,
    description: place.description,
    imageUrl: place.image ?? null,
    link: place.url ?? null,
    type: options.type,
    visibility: "PUBLIC",
    reward: { kind: "NONE" },
    claimLimit: limitOf(options.collectionLimit),
    startsAt: new Date(place.startsAt),
    endsAt: new Date(place.endsAt),
    latitude: place.latitude,
    longitude: place.longitude,
    radiusMeters: options.radius,
    spotCount: options.pinNumber,
    autoCollect: options.autoCollect,
    isMultiSpot: false,
    tags,
  };
}

/** The worker's `pins.batch`: creates the pins, keeps a progress log, never throws for one bad place. */
export async function runPinBatch(
  ctx: ServiceCtx,
  batchId: string,
  deps: BatchDeps = {},
  now = new Date(),
) {
  const { count } = await ctx.db.pinBatchJob.updateMany({
    where: { id: batchId, status: "QUEUED" },
    data: { status: "RUNNING" },
  });
  if (count !== 1) return { batchId, outcome: "SKIPPED" as const };
  const job = await ctx.db.pinBatchJob.findUniqueOrThrow({
    where: { id: batchId },
    select: { artistId: true, payload: true },
  });
  const { places, options } = job.payload as unknown as BatchPayload;
  const artist = { id: job.artistId };
  const log: BatchLog[] = [];
  const save = (status?: "SUCCEEDED" | "FAILED", error?: string) =>
    ctx.db.pinBatchJob.update({
      where: { id: batchId },
      data: {
        completed: log.filter((l) => l.status === "ok").length,
        log,
        ...(status ? { status, error } : {}),
      },
    });

  try {
    // Search tags come from the first place and are shared by the whole batch.
    const tags = (await deps.tags?.(places[0]!).catch(() => [])) ?? [];
    const enriched: BatchPlace[] = [];
    for (const place of places) {
      try {
        enriched.push((await deps.enrich?.(place)) ?? place);
      } catch {
        enriched.push(place);
      }
    }

    if (options.grouping === "single-group") {
      const first = enriched[0]!;
      const spots = enriched.flatMap((place) =>
        Array.from({ length: options.pinNumber }, () =>
          randomLocation(place.latitude, place.longitude, options.radius),
        ),
      );
      try {
        await createPin(
          ctx,
          artist,
          { ...pinInput(first, options, tags), spotCount: Math.min(spots.length, 100) },
          now,
          { spots: spots.slice(0, 100), maxRadius: MAX_RADIUS_METERS },
        );
        for (const place of enriched) log.push({ title: place.title, status: "ok" });
      } catch (error) {
        for (const place of enriched)
          log.push({ title: place.title, status: "error", error: messageOf(error) });
      }
    } else {
      for (const place of enriched) {
        try {
          await createPin(ctx, artist, pinInput(place, options, tags), now, undefined, {
            live: true,
          });
          log.push({ title: place.title, status: "ok" });
        } catch (error) {
          log.push({ title: place.title, status: "error", error: messageOf(error) });
        }
        if (log.length % PROGRESS_EVERY === 0) await save();
      }
    }
    const failed = log.filter((l) => l.status === "error").length;
    await save(
      failed > 0 ? "FAILED" : "SUCCEEDED",
      failed > 0 ? `${failed} pin(s) failed` : undefined,
    );
    return { batchId, outcome: "DONE" as const, created: log.length - failed, failed };
  } catch (error) {
    await save("FAILED", messageOf(error));
    return { batchId, outcome: "FAILED" as const, created: 0, failed: places.length };
  }
}

const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Progress of a batch, for the card that started it. */
export async function batchStatus(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  batchId: string,
  now = new Date(),
) {
  const job = await ctx.db.pinBatchJob.findFirst({
    where: { id: batchId, artistId: artist.id },
    select: { status: true, total: true, completed: true, log: true, error: true, updatedAt: true },
  });
  if (!job) return null;
  const log = (Array.isArray(job.log) ? job.log : []) as BatchLog[];
  const running = job.status === "QUEUED" || job.status === "RUNNING";
  const stalled = running && now.getTime() - job.updatedAt.getTime() > BATCH_STALL_MS;
  return {
    status: stalled ? ("FAILED" as const) : job.status,
    total: job.total,
    completed: job.completed,
    failed: log.filter((l) => l.status === "error").map((l) => l.title),
    error: stalled
      ? "Pin creation stopped responding. The pins made so far are on the map; ask again for the rest."
      : job.error,
  };
}
