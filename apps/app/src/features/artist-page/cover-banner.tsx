import { cn } from "@bandcoin/ui/lib/cn";

import { ArtistActions } from "../artist/artist-actions";
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
}: {
  artist: ArtistPageData;
  align?: "left" | "center";
}) {
  const banner = artist.coverUrl ?? artist.avatarUrl;
  const centered = align === "center";

  return (
    <section className="relative isolate flex min-h-[300px] items-end overflow-hidden rounded-[var(--page-radius,0px)] text-white sm:min-h-[340px]">
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
          "mx-auto grid w-full max-w-[80rem] gap-5 px-4 pt-16 pb-7 sm:px-8",
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
            <h1 className="display text-5xl break-words sm:text-6xl xl:text-7xl">{artist.name}</h1>
            <span className="text-sm text-white/75">
              {artist.itemCount.toLocaleString()} {artist.itemCount === 1 ? "drop" : "drops"}
            </span>
          </div>
        </div>
        <ArtistActions
          slug={artist.slug}
          following={artist.following}
          subscribed={artist.subscribed}
          followers={artist.followers}
          subscribers={artist.subscribers}
          token={artist.tokenCode ? { code: artist.tokenCode, artistId: artist.artistId } : null}
          popular={artist.popular}
        />
      </div>
    </section>
  );
}
