import type { Context } from "../../context";
import { publicBountyWhere } from "../../routers/app/bounty";
import { itemCardSelect, listedItemWhere, toItemCard } from "./item-card";

type ServiceCtx = Pick<Context, "db">;

export const MIN_SEARCH_LENGTH = 2;

/**
 * The search palette: a few matches each from items for sale, approved artists
 * and open bounties. Only what anyone may see; the full list is the marketplace.
 */
export async function searchAll(ctx: ServiceCtx, query: string) {
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH) return { items: [], artists: [], bounties: [] };
  const like = { contains: q, mode: "insensitive" } as const;

  const [items, artists, bounties] = await Promise.all([
    ctx.db.item.findMany({
      where: {
        ...listedItemWhere,
        listings: { some: { status: "ACTIVE", kind: { not: "BUNDLE" } } },
        OR: [{ title: like }, { organization: { name: like } }],
      },
      orderBy: [{ playCount: "desc" }, { id: "asc" }],
      take: 5,
      select: itemCardSelect,
    }),
    ctx.db.organization.findMany({
      where: { status: "APPROVED", name: like },
      orderBy: [{ followers: { _count: "desc" } }, { id: "asc" }],
      take: 5,
      select: { name: true, slug: true, avatarUrl: true, _count: { select: { followers: true } } },
    }),
    ctx.db.bounty.findMany({
      where: { ...publicBountyWhere, status: { not: "COMPLETED" }, title: like },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 4,
      select: { id: true, title: true },
    }),
  ]);

  return {
    items: items.map(toItemCard),
    artists: artists.map((artist) => ({
      name: artist.name,
      slug: artist.slug,
      avatarUrl: artist.avatarUrl,
      followers: artist._count.followers,
    })),
    bounties,
  };
}
