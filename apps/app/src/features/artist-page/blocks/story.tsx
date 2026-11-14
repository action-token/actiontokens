import { Globe, Link2 } from "lucide-react";

import type { Block } from "@bandcoin/page/blocks";
import { videoEmbed } from "@bandcoin/page/links";

import { socialLinks, type ArtistPageData } from "../artist-page-data";

import { BlockSection, EmptyLine, listSetting, textSetting } from "./shared";

/** The blocks an artist fills in by hand: about, links, videos and band members. */

export function AboutBlock({ block, empty }: { block: Block; empty: boolean }) {
  return (
    <BlockSection title={textSetting(block, "heading", "About")}>
      {empty ? (
        <EmptyLine>No bio yet.</EmptyLine>
      ) : (
        <div className="bg-surface rounded-[var(--page-radius)] border-2 p-5">
          <p className="text-fg-muted w-full text-[15px] leading-relaxed whitespace-pre-line">
            {textSetting(block, "body")}
          </p>
        </div>
      )}
    </BlockSection>
  );
}

const linkClass =
  "flex h-10 items-center gap-2 rounded-full bg-[var(--page-accent)] px-4 text-sm font-semibold text-[var(--page-accent-ink)] transition-opacity hover:opacity-90";

export function LinksBlock({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  const links = listSetting<{ label: string; url: string }>(block, "links");
  const socials = block.settings.showSocials !== false ? socialLinks(artist) : [];
  return (
    <BlockSection title={textSetting(block, "heading", "Links")}>
      {empty ? (
        <EmptyLine>No links yet.</EmptyLine>
      ) : (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={`${link.label}:${link.url}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={linkClass}
            >
              <Link2 className="size-4" /> {link.label}
            </a>
          ))}
          {socials.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="bg-surface-2 hover:bg-surface-3 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
            >
              <Globe className="size-4" /> {link.label}
            </a>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

export function VideosBlock({ block, empty }: { block: Block; empty: boolean }) {
  const videos = listSetting<{ title: string; url: string }>(block, "videos").flatMap((video) => {
    const embed = videoEmbed(video.url);
    return embed ? [{ title: video.title, embed }] : [];
  });
  return (
    <BlockSection title={textSetting(block, "heading", "Videos")}>
      {empty || videos.length === 0 ? (
        <EmptyLine>No videos yet.</EmptyLine>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.map(({ title, embed }) => (
            <figure key={embed.embedUrl} className="grid gap-2">
              <iframe
                src={embed.embedUrl}
                title={title || `${embed.provider} video`}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                className="aspect-video w-full rounded-[var(--page-radius)] border-0 bg-black"
              />
              {title && <figcaption className="text-fg-muted truncate text-sm">{title}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

export function BandMembersBlock({ block, empty }: { block: Block; empty: boolean }) {
  const members = listSetting<{ name: string; role?: string; photoUrl?: string }>(block, "members");
  return (
    <BlockSection title={textSetting(block, "heading", "Band members")}>
      {empty ? (
        <EmptyLine>No members listed yet.</EmptyLine>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {members.map((member) => (
            <li
              key={`${member.name}:${member.role ?? ""}`}
              className="grid justify-items-center gap-2 text-center"
            >
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- photos come from our storage
                <img
                  src={member.photoUrl}
                  alt=""
                  loading="lazy"
                  className="size-24 rounded-full object-cover"
                />
              ) : (
                <span className="bg-surface-2 display grid size-24 place-items-center rounded-full text-3xl">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
              )}
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
