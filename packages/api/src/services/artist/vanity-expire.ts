import { vanityTimeline, type VanityStatus } from "@bandcoin/utils/vanity";

import type { Context } from "../../context";
import { notifySelf } from "../notifications/send";

/**
 * The worker's hourly `vanity.expire`. A short link already behaves right from
 * its dates alone (see vanityTimeline); this does what needs something to
 * happen: three reminders in the artist's bell, the stored status kept in step
 * for admin lists, and names whose 30 reserved days are over set free.
 */
type ServiceCtx = Pick<Context, "db">;

const DAY_MS = 86_400_000;
/** The first reminder goes out this long before the paid month ends. */
export const REMIND_BEFORE_DAYS = 3;

export type VanityStage = "SOON" | "GRACE" | "LAPSED";

/** Which reminder a link is due, if any. */
export function reminderStage(link: { status: VanityStatus; paidUntil: Date }, now: Date) {
  const timeline = vanityTimeline(link, now);
  if (timeline.status === "GRACE") return "GRACE";
  if (timeline.status === "LAPSED") return now <= timeline.heldUntil ? "LAPSED" : null;
  return link.paidUntil.getTime() - now.getTime() <= REMIND_BEFORE_DAYS * DAY_MS ? "SOON" : null;
}

/**
 * What a reminder is about, kept in the notification itself: the stage, the
 * paid-until date and the name. A renewal moves the date, so the next month
 * gets its own reminders, and each one is sent once.
 */
export const vanityKey = (stage: VanityStage, paidUntil: Date, name: string) =>
  `vanity:${stage}:${paidUntil.toISOString()}:${name}`;

export function parseVanityKey(key: string | null | undefined) {
  const match = /^vanity:(SOON|GRACE|LAPSED):([^:]+:[^:]+:[^:]+):(.+)$/.exec(key ?? "");
  if (!match) return null;
  const paidUntil = new Date(match[2]!);
  return Number.isNaN(paidUntil.getTime())
    ? null
    : { stage: match[1] as VanityStage, paidUntil, name: match[3]! };
}

export async function expireVanityLinks(ctx: ServiceCtx, now = new Date()) {
  // Anything within reminder reach or past it; renewed links are further out.
  const links = await ctx.db.vanityUrl.findMany({
    where: { paidUntil: { lte: new Date(now.getTime() + REMIND_BEFORE_DAYS * DAY_MS) } },
    select: {
      artistId: true,
      name: true,
      status: true,
      paidUntil: true,
      graceEndsAt: true,
      reservedUntil: true,
      artist: { select: { userId: true } },
    },
  });

  let reminded = 0;
  let released = 0;
  let updated = 0;
  for (const link of links) {
    const timeline = vanityTimeline(link, now);

    // Past its reserved days: the name is free for anyone.
    if (timeline.status === "LAPSED" && now > timeline.heldUntil) {
      const { count } = await ctx.db.vanityUrl.deleteMany({
        where: { artistId: link.artistId, paidUntil: link.paidUntil },
      });
      released += count;
      continue;
    }

    // Keep the stored status in step (TRIAL/ACTIVE stay as they are until the month ends).
    if (
      (timeline.status === "GRACE" || timeline.status === "LAPSED") &&
      (link.status !== timeline.status ||
        link.graceEndsAt?.getTime() !== timeline.graceEndsAt.getTime() ||
        link.reservedUntil?.getTime() !== timeline.heldUntil.getTime())
    ) {
      await ctx.db.vanityUrl.updateMany({
        where: { artistId: link.artistId, paidUntil: link.paidUntil },
        data: {
          status: timeline.status,
          graceEndsAt: timeline.graceEndsAt,
          reservedUntil: timeline.heldUntil,
        },
      });
      updated += 1;
    }

    const stage = reminderStage(link, now);
    if (!stage) continue;
    const key = vanityKey(stage, link.paidUntil, link.name);
    const sent = await ctx.db.notificationEvent.findFirst({
      where: { type: "VANITY", entityId: key },
      select: { id: true },
    });
    if (sent) continue;
    await notifySelf(ctx, {
      type: "VANITY",
      userId: link.artist.userId,
      entityId: key,
      isForArtist: true,
    });
    reminded += 1;
  }
  return { checked: links.length, reminded, updated, released };
}
