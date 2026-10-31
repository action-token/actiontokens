import { ChevronDown, ChevronRight, ExternalLink, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { isAppError } from "@bandcoin/errors";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { Money } from "~/components/money";
import { ItemPurchase } from "~/features/buy/item-purchase";
import { LockedContent } from "~/features/nft/locked-content";
import { ReactionButtons } from "~/features/reactions/reaction-buttons";
import { playsLabel } from "~/lib/format";
import { ItemCard } from "~/features/catalog/item-card";
import { PlayButton } from "~/features/player/play-button";
import { AddToPlaylist } from "~/features/playlist/add-to-playlist";
import { TYPE_LABEL } from "~/lib/item-types";
import { Avatar } from "~/features/shell/context-panel";
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
 * dark fade, price and edition stickers and the framed cover; then the buy
 * panel across the page, details and recent sales.
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
  const royalty = Number(
    item.royaltyPercent ?? (item.contractNft ? item.contractNft.royaltyBps / 100 : 0),
  );
  const explorer = item.classicToken
    ? `https://stellar.expert/explorer/${item.network === "mainnet" ? "public" : "testnet"}/asset/${item.classicToken.code}-${item.classicToken.issuer}`
    : null;

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

  const facts: [string, string][] = [
    ["Type", label],
    ["Copies", item.supply === null ? "Unlimited" : item.supply.toLocaleString()],
    ["Sold", item.sold.toLocaleString()],
    ["Owners", item.holders.toLocaleString()],
    ...(royalty > 0
      ? ([["Artist royalty", `${royalty}% of every resale`]] as [string, string][])
      : []),
  ];
  // Only collectors who care about the blockchain need these, so they stay folded.
  const technical: [string, string][] = [
    ...(item.classicToken
      ? ([
          ["Token code", item.classicToken.code],
          [
            "Issuer",
            `${item.classicToken.issuer.slice(0, 6)}…${item.classicToken.issuer.slice(-6)}`,
          ],
        ] as [string, string][])
      : []),
    [
      "Network",
      item.chainType === "OFF_CHAIN"
        ? "Not on Stellar (Bandcoin keeps track of owners)"
        : item.network === "mainnet"
          ? "Stellar"
          : "Stellar testnet",
    ],
  ];

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

        <div className="mx-auto max-w-[80rem] px-4 pt-6 pb-10 sm:px-8 lg:pb-12">
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
                <h1 className="display text-4xl break-words sm:text-5xl xl:text-6xl">
                  {item.title}
                </h1>
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

              <div className="flex flex-wrap items-stretch gap-3">
                {primary && (
                  <Sticker
                    className="bg-primary text-primary-foreground -rotate-2"
                    label="Price"
                    note={
                      <>
                        ≈ <Money amount={primary.priceUsd} currency="USD" />
                      </>
                    }
                  >
                    <Money amount={primary.priceBandcoin} currency="BANDCOIN" onBrand />
                  </Sticker>
                )}
                {left !== null ? (
                  <Sticker
                    className="-rotate-1 bg-white/15"
                    label="Left"
                    note={item.supply ? `of ${item.supply.toLocaleString()}` : undefined}
                  >
                    {left === 0 ? "Sold out" : left.toLocaleString()}
                  </Sticker>
                ) : (
                  <Sticker
                    className="-rotate-1 bg-white/15"
                    label="Edition"
                    note={`${item.sold.toLocaleString()} sold`}
                  >
                    Open
                  </Sticker>
                )}
                {royalty > 0 && (
                  <Sticker className="rotate-2 bg-white/15" label="Royalty" note="on every resale">
                    {royalty}%
                  </Sticker>
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

      <PageBody wide className="grid gap-8">
        <section
          id="buy"
          className="border-fg bg-surface scroll-mt-24 rounded-[1.6rem] border-[3px] p-5 shadow-[8px_9px_0_0_var(--color-primary)] sm:p-7"
        >
          {item.access && !item.access.ok && (
            <AccessNotice access={item.access} artist={item.artist} />
          )}
          <ItemPurchase
            itemTitle={item.title}
            listings={item.listings}
            nft={item.chainType === "CONTRACT_NFT"}
          />
        </section>

        <LockedContent
          itemId={item.id}
          pieces={item.lockedContent}
          owned={item.ownedQuantity > 0}
          network={item.network}
        />

        <div className="grid gap-3">
          <Fold title="Details" open>
            <p className="text-fg-muted text-[15px] leading-relaxed whitespace-pre-line">
              {item.description?.trim() ? item.description : "No description yet."}
            </p>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="grid content-start gap-3">
                <Facts rows={facts} />
                <details>
                  <summary className="text-fg-muted hover:text-fg cursor-pointer text-sm font-semibold">
                    Technical details
                  </summary>
                  <div className="grid gap-3 pt-3">
                    <Facts rows={technical} />
                    {explorer && (
                      <a
                        href={explorer}
                        target="_blank"
                        rel="noreferrer"
                        className="marker text-primary-text inline-flex items-center gap-1.5 text-base hover:underline"
                      >
                        view on stellar expert <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </details>
              </div>
              <div className="grid content-start gap-4">
                {item.artist && (
                  <Link
                    href={`/artist/${item.artist.slug}`}
                    className="group hover:border-fg flex items-center gap-3 rounded-[1.2rem] border-2 p-3 transition-colors"
                  >
                    <Avatar
                      name={item.artist.name}
                      url={item.artist.avatarUrl}
                      className="bg-surface-3 grid size-12 shrink-0 place-items-center rounded-full object-cover text-sm font-bold"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="marker text-fg-muted block text-sm">made by</span>
                      <span className="display block truncate text-xl">{item.artist.name}</span>
                      {item.artist.bio && (
                        <span className="text-fg-muted line-clamp-1 text-sm">
                          {item.artist.bio}
                        </span>
                      )}
                    </span>
                    <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:-rotate-45">
                      <ChevronRight className="size-5" strokeWidth={2.6} />
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </Fold>

          <Fold title="Activity">
            {item.recentSales.length === 0 ? (
              <p className="text-fg-muted text-sm">No sales yet. Be the first.</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {item.recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <span>
                      <b className="font-semibold">{sale.buyer}</b> bought {sale.quantity}
                    </span>
                    <span className="text-fg-muted flex items-center gap-3">
                      <Money amount={sale.total} currency={sale.currency} />
                      <time dateTime={sale.at.toISOString()}>
                        {sale.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Fold>
        </div>

        {more && more.items.length > 0 && (
          <section
            className="grid gap-4 pt-4"
            aria-label={`More from ${more.artist?.name ?? artistName}`}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="display text-2xl">More from {more.artist?.name ?? artistName}</h2>
                <p className="marker text-fg-muted text-base">same artist, more drops</p>
              </div>
              {more.artist && (
                <Link
                  href={`/artist/${more.artist.slug}`}
                  className="text-fg-muted hover:text-fg text-sm font-semibold"
                >
                  See all
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
              {more.items.map((entry) => (
                <ItemCard key={entry.id} item={entry} queue={more.items} />
              ))}
            </div>
          </section>
        )}
      </PageBody>
    </>
  );
}

/** A price or count on a slightly tilted coloured block, as on Wadzzo's item page. */
function Sticker({
  label,
  note,
  className,
  children,
}: {
  label: string;
  note?: ReactNode;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl px-4 py-2 ${className}`}>
      <p className="text-[10px] font-bold tracking-wider uppercase opacity-75">{label}</p>
      <p className="display text-3xl leading-tight lg:text-4xl">{children}</p>
      {note && <p className="text-xs font-bold opacity-75">{note}</p>}
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-border divide-y-2 divide-dashed rounded-[1.2rem] border-2 text-sm">
      {rows.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-fg-muted font-semibold">{key}</dt>
          <dd className="truncate font-mono text-[13px] font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A collapsible section (Details, Activity). */
function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details
      open={open}
      className="group bg-surface rounded-[1.2rem] border-2 px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="display flex cursor-pointer list-none items-center justify-between text-xl">
        {title}
        <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 pt-4">{children}</div>
    </details>
  );
}

/** A members-only or tier item the viewer can't buy yet: what unlocks it, and where to get the token. */
function AccessNotice({
  access,
  artist,
}: {
  access: { tierName: string | null; code: string | null; reason: string | null };
  artist: { name: string; slug: string } | null;
}) {
  return (
    <p
      role="note"
      className="bg-surface-2 mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl p-4 text-sm"
    >
      <Lock className="text-primary-text size-4 shrink-0" />
      <span className="font-semibold">
        {access.tierName ? `For ${access.tierName} members.` : "For members."}
      </span>
      <span className="text-fg-muted">{access.reason}</span>
      {artist && access.code && (
        <Link
          href={`/artist/${artist.slug}`}
          className="text-primary-text font-semibold hover:underline"
        >
          Get {access.code} from {artist.name}
        </Link>
      )}
    </p>
  );
}
