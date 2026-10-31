import type { ChainGateway } from "@bandcoin/api";
import type { Db } from "@bandcoin/db";

import type { JobHandler } from "./runner";

export type WorkerDeps = { db: Db; chain: ChainGateway };

/** Every job type this worker runs. A type missing here is never taken from the queue. */
export function handlersFor(_deps: WorkerDeps): Record<string, JobHandler> {
  return {};
}
