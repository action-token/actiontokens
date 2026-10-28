import type { EmbedEvent } from "@bandcoin/ar-core/embed/config";
import type { Db } from "@bandcoin/db";

const COLUMN: Record<EmbedEvent, "views" | "pinTaps" | "openClicks" | "eventsClicks" | "bountiesClicks"> = {
  view: "views",
  pinTap: "pinTaps",
  open: "openClicks",
  events: "eventsClicks",
  bounties: "bountiesClicks",
};

/** Per process: enough to stop one visitor's loop inflating an artist's numbers. */
const LIMIT = 60;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function underLimit(key: string, now = Date.now()) {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= LIMIT;
}

/**
 * One counter bump for a website embed, per embed per UTC day. Anything
 * malformed, unknown or over the limit is ignored, never an error: a counter
 * must not surface on someone's site.
 */
export async function recordEmbedEvent(db: Pick<Db, "mapEmbed" | "mapEmbedDailyStat">, raw: string, ip: string, now = new Date()) {
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    return false;
  }
  const { id, e } = (body ?? {}) as { id?: unknown; e?: unknown };
  if (typeof id !== "string" || id === "preview" || typeof e !== "string" || !(e in COLUMN)) return false;
  if (!underLimit(`${ip}:${id}`, now.getTime())) return false;
  if (!(await db.mapEmbed.count({ where: { id } }))) return false;

  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const column = COLUMN[e as EmbedEvent];
  await db.mapEmbedDailyStat.upsert({
    where: { embedId_day: { embedId: id, day } },
    create: { embedId: id, day, [column]: 1 },
    update: { [column]: { increment: 1 } },
  });
  return true;
}
