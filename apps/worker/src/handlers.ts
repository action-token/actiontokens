import {
  createContext,
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
