import {
  type AgentRunPayload,
  createContext,
  dropDueHotspots,
  expireVanityLinks,
  checkDomains,
  importFacebookPost,
  type ImportPayload,
  openaiAgentModel,
  pinTags,
  placePhoto,
  runAgent,
  runPinBatch,
  useGeoCache,
  endStaleNftListings,
  syncAllSubscribers,
  sweepStories,
  keepUnlocksAlive,
  reconcileOrders,
  syncUnlocks,
  type ChainGateway,
  type TranscodePart,
  announceBounty,
  distributeRound,
  stellarExpertHistory,
  syncOriginHolders,
  syncQuarterHolders,
  type RoundKind,
} from "@actiontokens/api";
import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { mediaIo, type MediaIo, transcodeItem } from "./media/transcode";
import type { JobHandler } from "./runner";

export type WorkerDeps = { db: Db; chain: ChainGateway; media?: MediaIo };

const PARTS: readonly TranscodePart[] = ["all", "preview", "stems"];

/** Every job type this worker runs. A type missing here is never taken from the queue. */
export function handlersFor(deps: WorkerDeps): Record<string, JobHandler> {
  const context = () => createContext({ ...deps, app: "worker", session: null });
  return {
    // Settle payments whose answer from Stellar was lost (see services/orders/reconcile).
    "order.reconcile": async () => ({ result: await reconcileOrders(context()) }),

    // Record NFT unlocks the app couldn't (see catalog/unlock-chain); not a payment, so it retries.
    "nft.unlocks": async () => ({ result: await syncUnlocks(context()) }),
    // One chat message to the map agent: OpenAI and Google, steps shown live, answer saved. Never retried.
    "agent.run": async (job) => {
      const payload = job.payload as {
        agentJobId?: unknown;
        conversationId?: unknown;
        organizationId?: unknown;
      };
      if (
        typeof payload.agentJobId !== "string" ||
        typeof payload.conversationId !== "string" ||
        typeof payload.organizationId !== "string"
      )
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "agent.run needs its run details",
        });
      useGeoCache(deps.db);
      const result = await runAgent(context(), payload as AgentRunPayload, {
        model: openaiAgentModel,
      });
      return { result, target: { type: "AgentJob", id: payload.agentJobId } };
    },
    // Copies one new post from an artist's Facebook page (photos re-hosted). Safe to repeat: one post, once.
    "facebook.import": async (job) => {
      const payload = job.payload as ImportPayload & { organizationId?: unknown };
      if (typeof payload.organizationId !== "string" || typeof payload.fbPostId !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "facebook.import needs an organizationId and an fbPostId",
        });
      const result = await importFacebookPost(context(), payload.organizationId, payload);
      return { result, target: { type: "FacebookPost", id: payload.fbPostId } };
    },
    // Pins an artist confirmed on an agent card, made one by one. A failed place is logged, never retried.
    "pins.batch": async (job) => {
      const { batchId } = job.payload as { batchId?: unknown };
      if (typeof batchId !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "pins.batch needs a batchId" });
      const result = await runPinBatch(context(), batchId, {
        // A Google place's photo and link, and shared search tags: best effort, a failure leaves the pin plain.
        enrich: async (place) => {
          if (!place.gPlaceId) return place;
          const image =
            place.image ?? (await placePhoto(place.gPlaceId).catch(() => null)) ?? undefined;
          return {
            ...place,
            image,
            url: place.url ?? `https://www.google.com/maps/place/?q=place_id:${place.gPlaceId}`,
          };
        },
        tags: (place) =>
          pinTags(openaiAgentModel, {
            title: place.title,
            description: place.description,
            latitude: place.latitude,
            longitude: place.longitude,
            type: "LANDMARK",
          }),
      });
      return { result, target: { type: "PinBatchJob", id: batchId } };
    },
    // Clear stories that ended a day ago.
    "stories.sweep": async () => ({ result: await sweepStories(context()) }),
    // End resale listings of NFT copies the seller moved away.
    "resale.verify": async () => ({ result: await endStaleNftListings(context()) }),
    // Followers who trust an artist's fan token are subscribers; keep the saved flag true to the chain.
    "follows.sync": async () => ({ result: await syncAllSubscribers(context()) }),
    // Short-link reminders and freed names (see artist/vanity-expire); not a payment.
    "vanity.expire": async () => ({ result: await expireVanityLinks(context()) }),
    // Custom domains: ask the host, move status, ring the artist's bell (see services/domains).
    "domains.check": async () => ({ result: await checkDomains(context()) }),
    // Drop pins in hotspots whose next drop is due; a failed drop is reported, the rest carry on.
    "hotspot.drop": async () => ({ result: await dropDueHotspots(context()) }),
    // Keep the contract's unlock records from being archived.
    "nft.keep-alive": async () => ({ result: await keepUnlocksAlive(context()) }),

    // Pay a holder-reward round from the mother account. Safe to run again: it never pays a wallet twice.
    "rewards.distribute": async (job) => {
      const { kind, id } = job.payload as { kind?: unknown; id?: unknown };
      if ((kind !== "origin" && kind !== "quarter") || typeof id !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "rewards.distribute needs a kind and a round id",
        });
      const result = await distributeRound(context(), kind as RoundKind, id);
      return {
        result,
        target: { type: kind === "origin" ? "OriginReward" : "QuarterReward", id },
      };
    },
    // Find this month's PLOT holders, or this quarter's ACTION holders and what they held for 90 days.
    "rewards.sync": async (job) => {
      const { kind } = job.payload as { kind?: unknown };
      if (kind === "origin") return { result: await syncOriginHolders(context()) };
      if (kind === "quarter")
        return { result: await syncQuarterHolders(context(), stellarExpertHistory) };
      throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "rewards.sync needs a kind" });
    },
    // Post a newly funded bounty to the Telegram channel, when it's on. Retries if Telegram is down.
    "telegram.bounty": async (job) => {
      const { bountyId } = job.payload as { bountyId?: unknown };
      if (typeof bountyId !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "telegram.bounty needs a bountyId",
        });
      return {
        result: await announceBounty(context(), bountyId),
        target: { type: "Bounty", id: bountyId },
      };
    },

    // A song's stream, preview, waveform and stems (see media/transcode).
    "media.transcode": async (job) => {
      const payload = job.payload as { itemId?: unknown; part?: unknown };
      const part = PARTS.find((known) => known === payload.part) ?? "all";
      if (typeof payload.itemId !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "media.transcode needs an itemId",
        });
      const result = await transcodeItem(deps.db, deps.media ?? mediaIo, {
        itemId: payload.itemId,
        part,
        lastAttempt: job.attempts >= job.maxAttempts,
      });
      return { result, target: { type: "Item", id: payload.itemId } };
    },
  };
}
