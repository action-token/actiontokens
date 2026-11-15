import { cn } from "@bandcoin/ui/lib/cn";

import { ArtistActions } from "../artist/artist-actions";
import { ArtistStandingProvider } from "../artist/artist-standing";
import { ArtistStickyBar } from "./artist-sticky-bar";
import { StoryAvatar } from "./artist-stories";

import type { ArtistPageData } from "./artist-page-data";

/**
 * The top of an artist's page, like on a streaming app: a full-width banner
 * with their photo, name, followers, Play and Follow. Used by the standard
 * artist page and by the page builder's Cover block.
 */
export function CoverBanner({
  artist,
  align = "left",
  bleed = false,
  sticky = bleed,
}: {
  artist: ArtistPageData;
  align?: "left" | "center";
  /** Reach under the sidebar to the screen edge (the standard page's top band, not a builder block). */
  bleed?: boolean;
  /** The slim Play / Follow bar once the cover scrolls away (not in the editor's preview) */
  sticky?: boolean;
}) {
  const banner = artist.coverUrl ?? artist.avatarUrl;
  const centered = align === "center";
  const token = artist.tokenCode ? { code: artist.tokenCode, artistId: artist.artistId } : null;

  return (
    <ArtistStandingProvider
      slug={artist.slug}
      initial={{
        following: artist.following,
        subscribed: artist.subscribed,
        followers: artist.followers,
        subscribers: artist.subscribers,
      }}
    >
      <section
        className={cn(
          "relative isolate flex min-h-[300px] items-end overflow-hidden text-white sm:min-h-[340px]",
          bleed ? "bleed" : "rounded-[var(--page-radius,0px)]",
        )}
      >
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img
            src={banner}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full object-cover"
          />
        ) : (
          <div aria-hidden className="bg-primary absolute inset-0 -z-20" />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
        />
        <div
          className={cn(
            "grid w-full max-w-[var(--page-max,96rem)] gap-5 px-4 pt-16 pb-7 sm:px-8",
            centered && "justify-items-center text-center",
          )}
        >
          <div className={cn("flex items-end gap-5", centered && "flex-col items-center")}>
            <StoryAvatar
              slug={artist.slug}
              name={artist.name}
              url={artist.avatarUrl}
              className="bg-surface-3 text-fg hidden size-28 shrink-0 place-items-center rounded-full border-4 border-white object-cover text-3xl font-bold shadow-xl sm:grid lg:size-36"
            />
            <div className="grid min-w-0 gap-1">
              <span className="marker -rotate-1 text-lg text-white/80">*artist*</span>
              <h1
                className={cn(
                  "display break-words hyphens-auto",
                  // A long name steps down a size so it fits (and wraps) on a phone.
                  artist.name.length > 22
                    ? "text-[2.5rem] leading-[0.95] sm:text-6xl xl:text-7xl"
                    : "text-6xl sm:text-7xl xl:text-8xl",
                )}
              >
                {artist.name}
              </h1>
              <span className="text-sm text-white/75">
                {artist.itemCount.toLocaleString()} {artist.itemCount === 1 ? "drop" : "drops"}
              </span>
            </div>
          </div>
          <ArtistActions slug={artist.slug} token={token} popular={artist.popular} />
        </div>
      </section>
      {sticky && (
        <ArtistStickyBar
          slug={artist.slug}
          name={artist.name}
          avatarUrl={artist.avatarUrl}
          bannerUrl={banner}
          token={token}
          songs={artist.popular}
        />
      )}
    </ArtistStandingProvider>
  );
}
