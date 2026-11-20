"use client";

import { ArrowUpRight, Check, ChevronDown, MapPin, Ticket } from "lucide-react";
import { useState } from "react";

import { styleOf, type Block } from "@actiontokens/page/blocks";
import { cn } from "@actiontokens/ui/lib/cn";
import { MediaCarousel } from "@actiontokens/ui/patterns/media-carousel";

import { AlbumCard } from "../../catalog/album-card";
import { ItemCard, POSTER_WIDTH } from "../../catalog/item-card";
import { PlayAllButton, TrackList } from "../../music/track-list";
import { AR_URL } from "../../shell/nav";
import { collectiblesOf, type ArtistPageData } from "../artist-page-data";

import { BlockSection, CARD_GRID, EmptyLine, countSetting, fill, textSetting } from "./shared";

/** The blocks that show what the artist already has on Bandcoin: songs, albums, collectibles, tiers and events. */

type DataBlock = { block: Block; artist: ArtistPageData; empty: boolean };

/** The most "See more" opens Popular up to (like a streaming app). */
const MORE_SONGS = 10;

/** Popular songs: numbered rows (List) or covers (Cards), with Play all and See more. */
export function MusicBlock({ block, artist, empty }: DataBlock) {
  const [more, setMore] = useState(false);
  const count = countSetting(block, 5);
  const songs = artist.popular.slice(0, more ? Math.max(count, MORE_SONGS) : count);
  const canMore = artist.popular.length > count;
  const title = textSetting(block, "heading", "Popular");
  return (
    <BlockSection
      title={title}
      note="their most played songs"
      action={empty ? undefined : <PlayAllButton tracks={songs} />}
    >
      {empty ? (
        <EmptyLine>Your songs show here once you release one.</EmptyLine>
      ) : (
        <div className="grid justify-items-start gap-2">
          {styleOf(block, "music") === "cards" ? (
            <div className="grid w-full gap-4" style={fill("10rem")}>
              {songs.map((song) => (
                <ItemCard key={song.id} item={song} queue={songs} />
              ))}
            </div>
          ) : (
            <div className="w-full">
              <TrackList tracks={songs} />
            </div>
          )}
          {canMore && (
            <button
              type="button"
              onClick={() => setMore((value) => !value)}
              aria-expanded={more}
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1 px-2 py-1 text-sm font-semibold"
            >
              {more ? "See less" : "See more"}
              <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
            </button>
          )}
        </div>
      )}
    </BlockSection>
  );
}

/** Albums: a scrolling Row (like Home) or a Grid. */
export function ReleasesBlock({ block, artist, empty }: DataBlock) {
  const albums = artist.albums.slice(0, countSetting(block, 8));
  const title = textSetting(block, "heading", "Albums");
  if (empty)
    return (
      <BlockSection title={title} note="full releases">
        <EmptyLine>Your albums show here once you create one.</EmptyLine>
      </BlockSection>
    );
  if (styleOf(block, "releases") === "row")
    return (
      <MediaCarousel title={title} note="full releases" itemWidth="minmax(150px,184px)">
        {albums.map((album) => (
          <AlbumCard key={album.slug} album={album} />
        ))}
      </MediaCarousel>
    );
  return (
    <BlockSection title={title} note="full releases">
      <div className="grid gap-x-3 gap-y-5" style={fill("9.5rem")}>
        {albums.map((album) => (
          <AlbumCard key={album.slug} album={album} />
        ))}
      </div>
    </BlockSection>
  );
}

/** Collectibles for sale: a Grid or a scrolling Row. */
export function CollectiblesBlock({ block, artist, empty }: DataBlock) {
  const items = collectiblesOf(artist).slice(0, countSetting(block, 8));
  const title = textSetting(block, "heading", "Collectibles");
  const note = "own a piece of the music";
  if (empty)
    return (
      <BlockSection title={title} note={note}>
        <EmptyLine>Your collectibles show here once one is for sale.</EmptyLine>
      </BlockSection>
    );
  if (styleOf(block, "nft-gallery") === "row")
    return (
      <MediaCarousel title={title} note={note} itemWidth={POSTER_WIDTH}>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} queue={items} />
        ))}
      </MediaCarousel>
    );
  return (
    <BlockSection title={title} note={note}>
      <div className={cn(CARD_GRID, "gap-4")}>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} queue={items} />
        ))}
      </div>
    </BlockSection>
  );
}

/** Membership tiers as cards; the popular one stands out in the accent colour. */
export function MembershipBlock({ block, artist, empty }: DataBlock) {
  return (
    <BlockSection
      title={textSetting(block, "heading", "Membership")}
      note="hold their token to unlock a tier"
    >
      {empty ? (
        <EmptyLine>Your tiers show here once you add one.</EmptyLine>
      ) : (
        <ul className="grid gap-4" style={fill("15rem")}>
          {artist.tiers.map((tier) => (
            <li
              key={tier.id}
              className={cn(
                "bg-surface relative grid content-start gap-3 rounded-[var(--page-radius)] border-2 p-5",
                tier.isPopular &&
                  "border-[var(--page-accent)] shadow-[6px_7px_0_0_var(--page-accent)]",
              )}
            >
              {tier.isPopular && (
                <span className="marker absolute -top-3 right-4 -rotate-3 rounded-lg bg-[var(--page-accent)] px-2 py-0.5 text-sm text-[var(--page-accent-ink)]">
                  most popular!
                </span>
              )}
              <h3 className="display text-3xl leading-none">{tier.name}</h3>
              <p className="text-fg-muted text-sm">
                Hold{" "}
                <b className="display text-fg text-2xl">
                  {Number(tier.requiredTokens).toLocaleString()}
                </b>{" "}
                {artist.tokenCode ? `$${artist.tokenCode}` : "tokens"}
              </p>
              {tier.description && <p className="text-fg-muted text-sm">{tier.description}</p>}
              {tier.features.length > 0 && (
                <ul className="grid gap-1.5 border-t pt-3 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[var(--page-accent)]"
                        strokeWidth={3}
                      />
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

const part = (date: Date | string, options: Intl.DateTimeFormatOptions) =>
  new Date(date).toLocaleString("en-US", options);
const time = (date: Date | string) =>
  part(date, { weekday: "short", hour: "numeric", minute: "2-digit" });
const place = (event: ArtistPageData["events"][number]) =>
  [event.venueName, event.address].filter(Boolean).join(", ");

/** Upcoming events: a List with a big date badge, or Ticket cards. RSVPs happen in the AR app. */
export function TourBlock({ block, artist, empty }: DataBlock) {
  const events = artist.events.slice(0, countSetting(block, 5));
  const tickets = styleOf(block, "tour") === "tickets";
  return (
    <BlockSection title={textSetting(block, "heading", "Tour dates")} note="what's coming up">
      {empty ? (
        <EmptyLine>Your upcoming events show here.</EmptyLine>
      ) : tickets ? (
        <ul className="grid gap-4" style={fill("15rem")}>
          {events.map((event) => (
            <li key={event.id}>
              <a
                href={`${AR_URL}/events/${event.id}`}
                className="bg-surface group grid h-full overflow-hidden rounded-[var(--page-radius)] border-2 transition-transform hover:-translate-y-0.5"
              >
                <div className="grid gap-1 p-4">
                  <span
                    className="marker text-base text-[var(--page-accent)]"
                    suppressHydrationWarning
                  >
                    {part(event.startsAt, { month: "long", day: "numeric" })}
                  </span>
                  <b className="display text-2xl leading-tight">{event.title}</b>
                  {place(event) && (
                    <span className="text-fg-muted flex items-center gap-1.5 text-[13px]">
                      <MapPin className="size-3.5 shrink-0" /> {place(event)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t-2 border-dashed px-4 py-3 text-[13px]">
                  <span className="text-fg-muted" suppressHydrationWarning>
                    {time(event.startsAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--page-accent)] px-3 py-1 font-semibold text-[var(--page-accent-ink)]">
                    <Ticket className="size-3.5" /> RSVP
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-x-4 gap-y-2" style={fill("19rem")}>
          {events.map((event) => (
            <li key={event.id}>
              <a
                href={`${AR_URL}/events/${event.id}`}
                className="hover:bg-surface group flex items-center gap-3 rounded-[var(--page-radius)] p-2 pr-3 transition-colors"
              >
                <span
                  className="bg-surface-3 grid size-14 shrink-0 place-items-center content-center rounded-[var(--page-radius)] transition-colors group-hover:bg-[var(--page-accent)] group-hover:text-[var(--page-accent-ink)]"
                  suppressHydrationWarning
                >
                  <span className="text-[11px] font-bold tracking-wider uppercase">
                    {part(event.startsAt, { month: "short" })}
                  </span>
                  <span className="display text-2xl leading-none">
                    {part(event.startsAt, { day: "numeric" })}
                  </span>
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <b className="truncate text-[15px]">{event.title}</b>
                  <span className="text-fg-muted truncate text-[13px]" suppressHydrationWarning>
                    {[time(event.startsAt), place(event)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ArrowUpRight className="text-fg-muted size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  );
}
