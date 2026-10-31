import { createContext, reconcileOrders, type ChainGateway } from "@bandcoin/api";
import type { Db } from "@bandcoin/db";

import type { JobHandler } from "./runner";

export type WorkerDeps = { db: Db; chain: ChainGateway };

/** Every job type this worker runs. A type missing here is never taken from the queue. */
export function handlersFor(deps: WorkerDeps): Record<string, JobHandler> {
  const context = () => createContext({ ...deps, app: "worker", session: null });
  return {
    // Settle payments whose answer from Stellar was lost (see services/orders/reconcile).
    "order.reconcile": async () => ({ result: await reconcileOrders(context()) }),
  };
}
