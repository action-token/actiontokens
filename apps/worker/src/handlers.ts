import {
  createContext,
  dropDueHotspots,
  expireVanityLinks,
  lyriaProvider,
  generateInput,
  googleProvider,
  runGeneration,
  runMusic,
  runPinBatch,
  sweepStuckRuns,
  keepUnlocksAlive,
  reconcileOrders,
  syncUnlocks,
  type ChainGateway,
  type TranscodePart,
} from "@bandcoin/api";
import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

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
    // A Studio music run: Lyria, then storage; coins kept or refunded (see studio/music). Never retried.
    "studio.music": async (job) => {
      const { generationId } = job.payload as { generationId?: unknown };
      if (typeof generationId !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "studio.music needs a generationId",
        });
      const result = await runMusic(deps, generationId, { provider: lyriaProvider() });
      return { result, target: { type: "Generation", id: generationId } };
    },
    // A Studio image, video or writing run: Google, then storage; coins kept or refunded. Never retried.
    "studio.generate": async (job) => {
      const payload = job.payload as { generationId?: unknown; input?: unknown };
      const input = generateInput.safeParse(payload.input);
      if (typeof payload.generationId !== "string" || !input.success)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "studio.generate needs a generationId and its input",
        });
      const result = await runGeneration(deps, payload.generationId, input.data, {
        provider: googleProvider(),
      });
      return { result, target: { type: "Generation", id: payload.generationId } };
    },
    // Pins an artist confirmed on an agent card, made one by one. A failed place is logged, never retried.
    "pins.batch": async (job) => {
      const { batchId } = job.payload as { batchId?: unknown };
      if (typeof batchId !== "string")
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "pins.batch needs a batchId" });
      const result = await runPinBatch(context(), batchId);
      return { result, target: { type: "PinBatchJob", id: batchId } };
    },
    // Refund Studio runs that a stopped worker never finished.
    "studio.sweep": async () => ({ result: await sweepStuckRuns(deps) }),
    // Short-link reminders and freed names (see artist/vanity-expire); not a payment.
    "vanity.expire": async () => ({ result: await expireVanityLinks(context()) }),
    // Drop pins in hotspots whose next drop is due; a failed drop is reported, the rest carry on.
    "hotspot.drop": async () => ({ result: await dropDueHotspots(context()) }),
    // Keep the contract's unlock records from being archived.
    "nft.keep-alive": async () => ({ result: await keepUnlocksAlive(context()) }),

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
