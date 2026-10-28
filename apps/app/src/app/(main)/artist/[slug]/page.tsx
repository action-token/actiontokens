import { Globe, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { isAppError } from "@bandcoin/errors";
import { MediaCarousel, SectionTitle } from "@bandcoin/ui/patterns/media-carousel";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { Money } from "~/components/money";
import { ArtistActions } from "~/features/artist/artist-actions";
import { AlbumCard } from "~/features/catalog/album-card";
import { ItemCard } from "~/features/catalog/item-card";
import { TrackList } from "~/features/music/track-list";
import { Avatar } from "~/features/shell/context-panel";
import { serverApi } from "~/server/api";

const loadArtist = cache(async (slug: string) => {
  try {
    return await (await serverApi()).artist.bySlug({ slug });
  } catch (error) {
    if ((isAppError(error) && error.code === "RESOURCE_NOT_FOUND") || (error instanceof Error && error.message === "This artist doesn't exist.")) {
      notFound();
    }
    throw error;
  }
});

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const artist = await loadArtist((await params).slug);
  return {
    title: artist.name,
    description: artist.bio ?? `${artist.name}'s music, drops and bounties on Bandcoin.`,
    openGraph: { images: [artist.coverUrl ?? artist.avatarUrl ?? ""].filter(Boolean) },
  };
}

/**
 * An artist, like on a streaming app: a full-width banner with their photo,
 * name, followers, Play and Follow; then popular songs, albums, everything
 * for sale, live bounties and about.
 */
export default async function ArtistPage({ params }: Props) {
  const artist = await loadArtist((await params).slug);
  const banner = artist.coverUrl ?? artist.avatarUrl;

  return (
    <>
      <section className="relative isolate flex min-h-[300px] items-end overflow-hidden text-white sm:min-h-[340px]">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img src={banner} alt="" aria-hidden className="absolute inset-0 -z-20 size-full object-cover" />
        ) : (
          <div aria-hidden className="bg-primary absolute inset-0 -z-20" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
        <div className="mx-auto grid w-full max-w-[80rem] gap-5 px-4 pt-16 pb-7 sm:px-8">
          <div className="flex items-end gap-5">
            <Avatar
              name={artist.name}
              url={artist.avatarUrl}
              className="bg-surface-3 text-fg hidden size-28 shrink-0 place-items-center rounded-full border-4 border-white object-cover text-3xl font-bold shadow-xl sm:grid lg:size-36"
            />
            <div className="grid min-w-0 gap-1">
              <span className="marker -rotate-1 text-lg text-white/80">*artist*</span>
              <h1 className="display text-5xl break-words sm:text-6xl xl:text-7xl">{artist.name}</h1>
              <span className="text-sm text-white/75">
                {artist.itemCount.toLocaleString()} {artist.itemCount === 1 ? "drop" : "drops"}
              </span>
            </div>
          </div>
          <ArtistActions slug={artist.slug} following={artist.following} followers={artist.followers} popular={artist.popular} />
        </div>
      </section>

      <PageBody wide className="grid gap-12">
        {artist.popular.length > 0 && (
          <Section title="Popular" note="their most played songs">
            <TrackList tracks={artist.popular.slice(0, 5)} />
          </Section>
        )}

        {artist.albums.length > 0 && (
          <MediaCarousel title="Albums" note="full releases" itemWidth="minmax(160px,188px)">
            {artist.albums.map((album) => (
              <AlbumCard key={album.slug} album={album} />
            ))}
          </MediaCarousel>
        )}

        {artist.forSale.length > 0 && (
          <Section title="Drops" note="own a piece of the music">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {artist.forSale.map((item) => (
                <ItemCard key={item.id} item={item} queue={artist.forSale} />
              ))}
            </div>
          </Section>
        )}

        {artist.bounties.length > 0 && (
          <Section title="Live bounties" note="make something, win the prize">
            <ul className="grid gap-3 sm:grid-cols-2">
              {artist.bounties.map((bounty) => (
                <li key={bounty.id}>
                  <Link href={`/bounty/${bounty.id}`} className="bg-surface hover:border-border-strong grid h-full gap-2 rounded-lg border p-4 transition-colors">
                    <b className="display flex items-center gap-2 text-base">
                      <Trophy className="text-primary-text size-4 shrink-0" />
                      {bounty.title}
                    </b>
                    <p className="text-fg-muted line-clamp-2 text-[13px]">{bounty.summary}</p>
                    <span className="flex items-center justify-between pt-1 text-[13px]">
                      <Money amount={bounty.prize.amount} currency={bounty.prize.currency} className="font-semibold" />
                      <span className="text-fg-muted">{bounty.participants} joined</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="About" note={`the story of ${artist.name}`}>
          <div className="bg-surface grid gap-4 rounded-[1.2rem] border-2 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <p className="text-fg-muted max-w-prose text-[15px] leading-relaxed whitespace-pre-line">
              {artist.bio?.trim() ? artist.bio : `${artist.name} hasn't written a bio yet.`}
            </p>
            <div className="flex flex-wrap content-start gap-2 text-sm">
              {artist.website && <SocialLink href={artist.website} label="Website" />}
              {artist.instagram && <SocialLink href={`https://instagram.com/${artist.instagram.replace(/^@/, "")}`} label="Instagram" />}
              {artist.twitter && <SocialLink href={`https://x.com/${artist.twitter.replace(/^@/, "")}`} label="X" />}
            </div>
          </div>
        </Section>
      </PageBody>
    </>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4" aria-label={title}>
      <SectionTitle title={title} note={note} />
      {children}
    </section>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="bg-surface-2 hover:bg-surface-3 flex h-9 items-center gap-1.5 rounded-full px-3.5 font-semibold">
      <Globe className="size-4" /> {label}
    </a>
  );
}
