import { ChevronRight, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { isAppError } from "@bandcoin/errors";

import { ItemBody } from "~/features/catalog/item-body";
import { CoverBadges, RewardsLine } from "~/features/nft/locked-preview";
import { ReactionButtons } from "~/features/reactions/reaction-buttons";
import { playsLabel } from "~/lib/format";
import { PlayButton } from "~/features/player/play-button";
import { AddToPlaylist } from "~/features/playlist/add-to-playlist";
import { TYPE_LABEL } from "~/lib/item-types";
import { serverApi } from "~/server/api";

const loadItem = cache(async (slug: string) => {
  try {
    return await (await serverApi()).item.bySlug({ slug });
  } catch (error) {
    const missing =
      (isAppError(error) && error.code === "RESOURCE_NOT_FOUND") ||
      (error instanceof Error && error.message === "This item doesn't exist.");
    if (missing) notFound();
    throw error;
  }
});

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await loadItem((await params).slug);
  const description = (
    item.description ?? `${item.title} by ${item.artist?.name ?? "Bandcoin"}`
  ).slice(0, 180);
  return {
    title: `${item.title} by ${item.artist?.name ?? "Bandcoin"}`,
    description,
    alternates: { canonical: `/item/${item.slug}` },
    openGraph: {
      title: item.title,
      description,
      images: [{ url: item.coverUrl, alt: item.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description,
      images: [item.coverUrl],
    },
  };
}

/**
 * One item, laid out like Wadzzo's: a full-width hero with the cover behind a
 * dark fade, title and framed cover; then the price and buying beside
 * everything else about the item (see ItemBody).
 */
export default async function ItemPage({ params }: Props) {
  const { slug } = await params;
  const [item, more] = await Promise.all([
    loadItem(slug),
    (await serverApi()).catalog.moreFromArtist({ itemSlug: slug }),
  ]);
  const artistName = item.artist?.name ?? item.track?.artistName ?? "Bandcoin";
  const label = TYPE_LABEL[item.type] ?? item.type;
  const primary = item.listings.find((listing) => listing.kind === "PRIMARY") ?? item.listings[0];
  const left = primary?.remaining ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.title,
    image: item.coverUrl,
    description: item.description ?? undefined,
    brand: { "@type": "Brand", name: artistName },
    offers: primary
      ? {
          "@type": "Offer",
          price: Number(primary.priceUsd).toFixed(2),
          priceCurrency: "USD",
          availability: left === 0 ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        }
      : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="relative isolate overflow-hidden text-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img
          src={item.coverUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-60 blur-sm"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-black/95 via-black/80 to-black/45"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-transparent to-transparent"
        />

        <div className="max-w-[var(--page-max,96rem)] px-4 pt-5 pb-10 sm:px-8 lg:pt-8 lg:pb-10">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white/70"
          >
            <Link href="/marketplace" className="hover:text-white">
              Marketplace
            </Link>
            <ChevronRight className="size-3.5" />
            {item.artist && (
              <>
                <Link href={`/artist/${item.artist.slug}`} className="truncate hover:text-white">
                  {item.artist.name}
                </Link>
                <ChevronRight className="size-3.5" />
              </>
            )}
            <span className="truncate text-white">{item.title}</span>
          </nav>

          <div className="grid items-center gap-8 pt-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:gap-10">
            <div className="grid min-w-0 gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase">
                  {label}
                </span>
                {item.access && (
                  <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase">
                    <Lock className="size-3.5" />{" "}
                    {item.access.tierName ? `${item.access.tierName} members` : "Members only"}
                  </span>
                )}
                {item.ownedQuantity > 0 && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tracking-wider text-black uppercase">
                    You own {item.ownedQuantity}
                  </span>
                )}
              </div>

              <div className="grid gap-2">
                <p className="marker -rotate-2 text-lg text-white/75">
                  *by{" "}
                  {item.artist ? (
                    <Link
                      href={`/artist/${item.artist.slug}`}
                      className="text-primary hover:underline"
                    >
                      {artistName}
                    </Link>
                  ) : (
                    artistName
                  )}
                  *
                </p>
                <h1 className="display text-5xl break-words sm:text-6xl xl:text-7xl">
                  {item.title}
                </h1>
                <RewardsLine pieces={item.lockedContent} />
                {item.track?.album && (
                  <p className="text-sm text-white/65">
                    From{" "}
                    <Link
                      href={`/album/${item.track.album.slug}`}
                      className="font-semibold text-white hover:underline"
                    >
                      {item.track.album.title}
                    </Link>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {item.media?.mediaType === "AUDIO" && (
                  <AddToPlaylist
                    itemId={item.id}
                    title={item.title}
                    variant="button"
                    className="w-fit bg-white/15 text-white hover:bg-white/25"
                  />
                )}
                <ReactionButtons
                  itemId={item.id}
                  tone="onDark"
                  className="rounded-full bg-white/10 p-0.5"
                />
                {item.media?.mediaType === "AUDIO" && (
                  <span className="num text-sm text-white/70">{playsLabel(item.playCount)}</span>
                )}
              </div>
            </div>

            <div className="mx-auto w-full max-w-[22rem]">
              <div className="relative">
                <div className="bg-surface overflow-hidden rounded-[1.4rem] border-[3px] border-white shadow-[10px_12px_0_0_var(--color-primary)] lg:rotate-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="aspect-square w-full object-cover"
                  />
                  <CoverBadges pieces={item.lockedContent} />
                </div>
                {item.media?.mediaType === "AUDIO" && (
                  <PlayButton
                    track={{
                      id: item.id,
                      slug: item.slug,
                      title: item.title,
                      artistName,
                      coverUrl: item.coverUrl,
                    }}
                    className="absolute right-4 bottom-4 lg:right-2 lg:bottom-6"
                  />
                )}
                <span className="marker bg-primary text-primary-foreground pointer-events-none absolute -top-3 -left-3 -rotate-12 rounded-lg px-2.5 py-1 text-base">
                  {left === 0
                    ? "sold out!"
                    : left !== null && left <= 10
                      ? `only ${left} left!`
                      : `${label.toLowerCase()} drop!`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ItemBody item={item} more={more} artistName={artistName} />
    </>
  );
}
