import { ArrowUpRight, Globe, Link2 } from "lucide-react";

import { styleOf, type Block } from "@bandcoin/page/blocks";
import { videoEmbed } from "@bandcoin/page/links";
import { cn } from "@bandcoin/ui/lib/cn";

import { socialLinks, type ArtistPageData } from "../artist-page-data";
import { ArtistHighlights, ArtistStories } from "../artist-stories";

import { BlockSection, CARD_GRID, EmptyLine, fill, listSetting, textSetting } from "./shared";

/** The blocks an artist fills in by hand: about, links, videos and band members. */

/** About: a readable Text column, a Big quote in display type, or a Photo card (their cover with the bio over it). */
export function AboutBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  const body = textSetting(block, "body");
  const style = styleOf(block, "about");
  const photo = artist.coverUrl ?? artist.avatarUrl;
  // A long bio in Big quote type would become a wall of capitals; it steps down a size.
  const long = body.length > 160;
  return (
    <BlockSection title={textSetting(block, "heading", "About")}>
      {empty ? (
        <EmptyLine>Add a few words about yourself.</EmptyLine>
      ) : style === "card" ? (
        <figure
          className={cn(
            "relative isolate flex w-full max-w-4xl items-end overflow-hidden rounded-[var(--page-radius)] text-white",
            // No picture: the accent colour fades to dark, and the card only grows to fit the text.
            photo
              ? "bg-surface-3 min-h-80 sm:min-h-[26rem]"
              : "min-h-56 bg-[linear-gradient(160deg,var(--page-accent),#111_75%)]",
          )}
        >
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
            <img
              src={photo}
              alt=""
              aria-hidden
              className="absolute inset-0 -z-20 size-full object-cover"
            />
          )}
          {photo && (
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
            />
          )}
          <span className="absolute top-5 right-5 grid size-20 place-items-center content-center rounded-full bg-[var(--page-accent)] text-center text-[var(--page-accent-ink)] shadow-lg">
            <b className="display text-2xl leading-none">{artist.followers.toLocaleString()}</b>
            <span className="text-[10px] font-semibold">
              {artist.followers === 1 ? "follower" : "followers"}
            </span>
          </span>
          <figcaption className="grid max-w-2xl gap-2 p-6 pt-28 sm:p-8 sm:pt-28">
            <b className="text-sm">
              {artist.itemCount.toLocaleString()} {artist.itemCount === 1 ? "drop" : "drops"} on
              Bandcoin
            </b>
            <p className="line-clamp-8 text-[15px] leading-relaxed whitespace-pre-line text-white/90">
              {body}
            </p>
          </figcaption>
        </figure>
      ) : style === "quote" ? (
        // Sized by the block's width (it is an @container), so a quarter-width quote stays readable.
        <blockquote className="relative pl-[1.4em] text-[clamp(1.5rem,7cqi,2.75rem)]">
          <span
            aria-hidden
            className="display absolute -top-[0.15em] left-0 text-[2em] leading-none text-[var(--page-accent)]"
          >
            &ldquo;
          </span>
          <p
            className={cn(
              "display leading-[1.05] whitespace-pre-line",
              long && "max-w-[40ch] text-[clamp(1.15rem,4.2cqi,1.75rem)] leading-[1.12]",
            )}
          >
            {body}
          </p>
        </blockquote>
      ) : (
        <p className="text-fg-muted max-w-[68ch] text-base leading-relaxed whitespace-pre-line sm:text-[17px]">
          {body}
        </p>
      )}
    </BlockSection>
  );
}

type Link = { label: string; href: string; own: boolean };

/** Links: full-width stacked Buttons (like a link-in-bio page) or compact Chips. */
export function LinksBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  const own = listSetting<{ label: string; url: string }>(block, "links").map((link): Link => ({
    label: link.label,
    href: link.url,
    own: true,
  }));
  const socials = (block.settings.showSocials !== false ? socialLinks(artist) : []).map(
    (link): Link => ({ ...link, own: false }),
  );
  const links = [...own, ...socials];
  const chips = styleOf(block, "links") === "chips";
  return (
    <BlockSection title={textSetting(block, "heading", "Links")}>
      {empty ? (
        <EmptyLine>Add a link, or your website and socials in Settings.</EmptyLine>
      ) : chips ? (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-opacity hover:opacity-85",
                link.own
                  ? "bg-[var(--page-accent)] text-[var(--page-accent-ink)]"
                  : "bg-surface-2 hover:bg-surface-3",
              )}
            >
              {link.own ? <Link2 className="size-4" /> : <Globe className="size-4" />} {link.label}
            </a>
          ))}
        </div>
      ) : (
        // One column in a narrow block; side by side when there is room.
        <ul className="grid gap-2" style={fill("16rem")}>
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={cn(
                  "group flex h-13 items-center gap-3 rounded-[var(--page-radius)] border-2 px-4 font-semibold transition-transform hover:-translate-y-0.5",
                  link.own
                    ? "border-[var(--page-accent)] bg-[var(--page-accent)] text-[var(--page-accent-ink)]"
                    : "bg-surface hover:border-border-strong",
                )}
              >
                {link.own ? (
                  <Link2 className="size-4 shrink-0" />
                ) : (
                  <Globe className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{link.label}</span>
                <ArrowUpRight className="size-4 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  );
}

/** Videos: an even Grid, or Featured (the first one large, the rest under it). */
export function VideosBlock({ block, empty }: { block: Block; empty: boolean }) {
  const videos = listSetting<{ title: string; url: string }>(block, "videos").flatMap((video) => {
    const embed = videoEmbed(video.url);
    return embed ? [{ title: video.title, embed }] : [];
  });
  const featured = styleOf(block, "videos") === "featured";
  const [first, ...rest] = videos;
  return (
    <BlockSection title={textSetting(block, "heading", "Videos")}>
      {empty || !first ? (
        <EmptyLine>Add a YouTube or Vimeo link.</EmptyLine>
      ) : featured ? (
        <div className="grid gap-4">
          <Video {...first} big />
          {rest.length > 0 && (
            <div className="grid gap-4" style={fill("12rem")}>
              {rest.map((video) => (
                <Video key={video.embed.embedUrl} {...video} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={fill("18rem")}>
          {videos.map((video) => (
            <Video key={video.embed.embedUrl} {...video} />
          ))}
        </div>
      )}
    </BlockSection>
  );
}

function Video({
  title,
  embed,
  big = false,
}: {
  title: string;
  embed: NonNullable<ReturnType<typeof videoEmbed>>;
  big?: boolean;
}) {
  return (
    <figure className="grid gap-2">
      <iframe
        src={embed.embedUrl}
        title={title || `${embed.provider} video`}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video w-full rounded-[var(--page-radius)] border-0 bg-black"
      />
      {title && (
        <figcaption className={cn("truncate", big ? "display text-2xl" : "text-fg-muted text-sm")}>
          {title}
        </figcaption>
      )}
    </figure>
  );
}

type Member = { name: string; role?: string; photoUrl?: string };

/** Band members: round Circles, or Cards with a square photo. */
export function BandMembersBlock({ block, empty }: { block: Block; empty: boolean }) {
  const members = listSetting<Member>(block, "members");
  const cards = styleOf(block, "band-members") === "cards";
  return (
    <BlockSection title={textSetting(block, "heading", "Band members")}>
      {empty ? (
        <EmptyLine>Add who is in the band.</EmptyLine>
      ) : cards ? (
        <ul className={cn(CARD_GRID, "gap-4")}>
          {members.map((member) => (
            <li
              key={`${member.name}:${member.role ?? ""}`}
              className="bg-surface overflow-hidden rounded-[var(--page-radius)] border-2"
            >
              <Photo member={member} className="aspect-square w-full text-6xl" />
              <div className="grid gap-0.5 p-3">
                <b className="display truncate text-xl">{member.name}</b>
                {member.role && (
                  <span className="text-fg-muted truncate text-xs">{member.role}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-x-3 gap-y-5" style={fill("7.5rem")}>
          {members.map((member) => (
            <li
              key={`${member.name}:${member.role ?? ""}`}
              className="grid justify-items-center gap-2 text-center"
            >
              <span className="block rounded-full border-2 border-[var(--page-accent)] p-1">
                <Photo member={member} className="size-24 rounded-full text-3xl" />
              </span>
              <span className="grid">
                <b className="text-sm">{member.name}</b>
                {member.role && <span className="text-fg-muted text-xs">{member.role}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </BlockSection>
  );
}

function Photo({ member, className }: { member: Member; className: string }) {
  return member.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- photos come from our storage
    <img
      src={member.photoUrl}
      alt=""
      loading="lazy"
      className={cn("bg-surface-2 object-cover", className)}
    />
  ) : (
    <span className={cn("bg-surface-2 display grid place-items-center", className)}>
      {member.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Their live stories as a row of round tiles. Fans see it only while a story is live. */
export function StoriesBlock({
  block,
  artist,
  editing,
}: {
  block: Block;
  artist: ArtistPageData;
  editing: boolean;
}) {
  const title = textSetting(block, "heading", "Stories");
  return (
    <ArtistStories
      slug={artist.slug}
      title={title}
      whenEmpty={
        editing ? (
          <BlockSection title={title} note="gone in 24 hours">
            <EmptyLine>Your stories show here while one is live.</EmptyLine>
          </BlockSection>
        ) : null
      }
    />
  );
}

/** Everything they ever shared, newest first, as a row of tiles. */
export function HighlightsBlock({
  block,
  artist,
  editing,
}: {
  block: Block;
  artist: ArtistPageData;
  editing: boolean;
}) {
  const title = textSetting(block, "heading", "Highlights");
  return (
    <ArtistHighlights
      slug={artist.slug}
      title={title}
      whenEmpty={
        editing ? (
          <BlockSection title={title} note="everything they've shared">
            <EmptyLine>Your highlights show here once you have shared a story.</EmptyLine>
          </BlockSection>
        ) : null
      }
    />
  );
}
