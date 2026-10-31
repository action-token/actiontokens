import { enqueueJob, type JobType } from "@bandcoin/api";
import type { Db } from "@bandcoin/db";

/** Jobs that run on a clock rather than when something happens. */
export const SCHEDULES: { type: JobType; everyMs: number }[] = [
  // Settle payments whose answer from Stellar was lost.
  { type: "order.reconcile", everyMs: 60_000 },
];

/**
 * Adds each scheduled job when it's due. `dedupe` means a run still waiting
 * or running isn't doubled, so a slow run never piles up behind itself.
 */
export function startSchedules(db: Db, schedules = SCHEDULES) {
  const timers = schedules.map(({ type, everyMs }) => {
    const add = () =>
      void enqueueJob(db, type, {}, { dedupe: true, maxAttempts: 1 }).catch((error: unknown) =>
        console.error(`[worker] couldn't schedule ${type}`, error),
      );
    add();
    return setInterval(add, everyMs);
  });
  return () => timers.forEach((timer) => clearInterval(timer));
}
