import { enqueueJob, type JobType } from "@bandcoin/api";
import type { Db } from "@bandcoin/db";

/** Jobs that run on a clock rather than when something happens. */
export const SCHEDULES: { type: JobType; everyMs: number }[] = [
  // Settle payments whose answer from Stellar was lost.
  { type: "order.reconcile", everyMs: 60_000 },
  // Record NFT unlocks a collect couldn't record right away.
  { type: "nft.unlocks", everyMs: 5 * 60_000 },
  // Stories that ended a day ago: rows cleared (see feed/stories).
  { type: "stories.sweep", everyMs: 60 * 60_000 },
  // Resale listings of NFT copies the seller no longer owns are ended.
  { type: "resale.verify", everyMs: 30 * 60_000 },
  // Followers vs subscribers: who trusts each fan token (see feed/subscribe).
  { type: "follows.sync", everyMs: 30 * 60_000 },
  // Short links: reminders, stored status, and names past their reserved days set free.
  { type: "vanity.expire", everyMs: 60 * 60_000 },
  // Custom domains: waiting ones each time, live ones once a day (see services/domains).
  { type: "domains.check", everyMs: 15 * 60_000 },
  // Drop pins in hotspots whose next drop is due (see services/artist/hotspots).
  { type: "hotspot.drop", everyMs: 5 * 60_000 },
  // Keep the NFT contract's unlock records alive (archived after months untouched).
  { type: "nft.keep-alive", everyMs: 7 * 24 * 60 * 60_000 },
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
