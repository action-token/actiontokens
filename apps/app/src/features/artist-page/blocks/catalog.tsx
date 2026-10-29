import { Calendar, MapPin } from "lucide-react";

import type { Block } from "@bandcoin/page/blocks";

import { AlbumCard } from "../../catalog/album-card";
import { ItemCard } from "../../catalog/item-card";
import { TrackList } from "../../music/track-list";
import { AR_URL } from "../../shell/nav";
import type { ArtistPageData } from "../artist-page-data";

import { BlockSection, EmptyLine, countSetting, textSetting } from "./shared";

/** The blocks that show what the artist already has on Bandcoin: songs, albums, collectibles, tiers and events. */

export function MusicBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  return (
    <BlockSection title={textSetting(block, "heading", "Popular")} note="their most played songs">
      {empty ? (
        <EmptyLine>No songs yet.</EmptyLine>
      ) : (
        <TrackList tracks={artist.popular.slice(0, countSetting(block, 5))} />
      )}
    </BlockSection>
  );
}

export function ReleasesBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  return (
    <BlockSection title={textSetting(block, "heading", "Albums")} note="full releases">
      {empty ? (
        <EmptyLine>No albums yet.</EmptyLine>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {artist.albums.slice(0, countSetting(block, 8)).map((album) => (
            <AlbumCard key={album.slug} album={album} />
          ))}
        </div>
      )}
    </BlockSection>
  );
}

export function CollectiblesBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  return (
    <BlockSection
      title={textSetting(block, "heading", "Collectibles")}
      note="own a piece of the music"
    >
      {empty ? (
        <EmptyLine>Nothing for sale right now.</EmptyLine>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {artist.forSale.slice(0, countSetting(block, 8)).map((item) => (
            <ItemCard key={item.id} item={item} queue={artist.forSale} />
          ))}
        </div>
      )}
    </BlockSection>
  );
}

export function MembershipBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  return (
    <BlockSection
      title={textSetting(block, "heading", "Membership")}
      note="hold their token to unlock a tier"
    >
      {empty ? (
        <EmptyLine>No membership tiers yet.</EmptyLine>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {artist.tiers.map((tier) => (
            <li
              key={tier.id}
              className="bg-surface grid content-start gap-3 rounded-[var(--page-radius)] border-2 p-5"
              style={tier.isPopular ? { borderColor: "var(--page-accent)" } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="display text-lg">{tier.name}</h3>
                {tier.isPopular && (
                  <span className="rounded-full bg-[var(--page-accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--page-accent-ink)]">
                    Popular
                  </span>
                )}
              </div>
              {tier.description && <p className="text-fg-muted text-sm">{tier.description}</p>}
              <p className="text-sm">
                Hold <b className="num">{Number(tier.requiredTokens).toLocaleString()}</b>{" "}
                {artist.tokenCode ?? "tokens"}
              </p>
              {tier.features.length > 0 && (
                <ul className="text-fg-muted grid gap-1 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span aria-hidden className="text-[var(--page-accent)]">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  );
}

const when = (date: Date | string) =>
  new Date(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function TourBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  return (
    <BlockSection title={textSetting(block, "heading", "Tour dates")} note="what's coming up">
      {empty ? (
        <EmptyLine>No upcoming events.</EmptyLine>
      ) : (
        <ul className="grid gap-3">
          {artist.events.slice(0, countSetting(block, 5)).map((event) => (
            <li key={event.id}>
              {/* RSVPs happen in the AR app, where events live. */}
              <a
                href={`${AR_URL}/events/${event.id}`}
                className="bg-surface hover:border-border-strong grid gap-1 rounded-[var(--page-radius)] border p-4 transition-colors"
              >
                <b className="display text-base">{event.title}</b>
                <span className="text-fg-muted flex items-center gap-1.5 text-[13px]">
                  <Calendar className="size-3.5 shrink-0" />{" "}
                  <span suppressHydrationWarning>{when(event.startsAt)}</span>
                </span>
                {(event.venueName ?? event.address) && (
                  <span className="text-fg-muted flex items-center gap-1.5 text-[13px]">
                    <MapPin className="size-3.5 shrink-0" />{" "}
                    {[event.venueName, event.address].filter(Boolean).join(", ")}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  );
}
