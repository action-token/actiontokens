import { Music2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isAppError } from "@bandcoin/errors";
import { Badge } from "@bandcoin/ui/components/badge";

import { ItemPurchase } from "~/features/buy/item-purchase";
import { AppHeader } from "~/features/shell/app-header";
import { serverApi } from "~/server/api";

const TYPE_LABEL: Record<string, string> = {
  TRACK: "Track",
  VIDEO: "Video",
  IMAGE: "Artwork",
  MODEL_3D: "3D collectible",
  DOCUMENT: "Document",
  ROYALTY: "Royalty share",
  TICKET: "Ticket",
  MERCH: "Merch",
  FAN_TOKEN: "Fan token",
};

async function loadItem(slug: string) {
  try {
    return await (await serverApi()).item.bySlug({ slug });
  } catch (error) {
    if (isAppError(error) && error.code === "RESOURCE_NOT_FOUND") notFound();
    // tRPC wraps service errors; a missing item still means 404
    if (error instanceof Error && error.message === "This item doesn't exist.") notFound();
    throw error;
  }
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await loadItem((await params).slug);
  return {
    title: item.title,
    description: item.description ?? `${item.title} by ${item.artist?.name ?? "Bandcoin"}`,
    openGraph: { images: [item.coverUrl] },
  };
}

export default async function ItemPage({ params }: Props) {
  const item = await loadItem((await params).slug);
  const artistName = item.artist?.name ?? item.track?.artistName ?? "Bandcoin";

  return (
    <>
      <AppHeader />
      <main className="relative isolate mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[420px] opacity-35 blur-[90px]"
          style={{ background: `radial-gradient(closest-side, ${item.accentColor ?? "var(--color-primary)"}, transparent)` }}
        />
        <div className="grid content-start gap-6">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:items-end">
            {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
            <img
              src={item.coverUrl}
              alt=""
              className="shadow-raised aspect-square w-full rounded-xl border object-cover"
            />
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{TYPE_LABEL[item.type] ?? item.type}</Badge>
                {item.tier && <Badge variant="secondary">{item.tier.name} members</Badge>}
                {item.ownedQuantity > 0 && <Badge variant="secondary">You own {item.ownedQuantity}</Badge>}
              </div>
              <h1 className="font-display text-[clamp(28px,4vw,44px)] leading-[1.05] font-extrabold tracking-tight">
                {item.title}
              </h1>
              {item.artist ? (
                <Link href={`/artist/${item.artist.slug}`} className="text-fg-muted hover:text-fg w-fit font-semibold">
                  {artistName}
                </Link>
              ) : (
                <span className="text-fg-muted font-semibold">{artistName}</span>
              )}
              {item.track?.album && <p className="text-fg-faint text-sm">From {item.track.album.title}</p>}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3">
            <Stat label="Holders" value={item.holders.toLocaleString()} icon={<Users className="size-4" />} />
            <Stat label="Supply" value={item.supply === null ? "Unlimited" : item.supply.toLocaleString()} />
            <Stat label="Plays" value={item.playCount.toLocaleString()} icon={<Music2 className="size-4" />} />
          </dl>

          {item.description && (
            <section className="grid gap-2">
              <h2 className="eyebrow">About</h2>
              <p className="text-fg-muted max-w-prose leading-relaxed whitespace-pre-line">{item.description}</p>
            </section>
          )}
        </div>

        <ItemPurchase itemTitle={item.title} listings={item.listings} />
      </main>
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-surface grid gap-1 rounded-md border p-3">
      <dt className="text-fg-faint flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </dt>
      <dd className="num text-lg font-semibold">{value}</dd>
    </div>
  );
}
