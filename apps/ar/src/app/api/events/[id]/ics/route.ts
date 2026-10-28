import { eventIcs } from "@bandcoin/ar-core/ar/events";
import { site } from "@bandcoin/ar-core/site";
import { db } from "@bandcoin/db/server";

/**
 * GET /api/events/:id/ics: the event as an iCalendar file, for "Add to
 * calendar". Public, like the event itself.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.event.findUnique({ where: { id }, include: { artist: { select: { name: true } } } });
  if (!row) return new Response("Event not found", { status: 404 });

  const ics = eventIcs(
    {
      id: row.id,
      title: row.title,
      description: row.description,
      link: row.link,
      venueName: row.venueName,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      startDate: row.startsAt.toISOString(),
      endDate: row.endsAt.toISOString(),
      artist: { name: row.artist.name },
    },
    `${site.urls.arWeb}/events/${row.id}`,
  );
  const filename = (row.title.replace(/[^\w\- ]+/g, "").trim() || "event").slice(0, 60);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}.ics"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
