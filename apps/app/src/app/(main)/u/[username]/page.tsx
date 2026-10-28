import { Lock, Mic2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { isAppError } from "@bandcoin/errors";
import { SectionTitle } from "@bandcoin/ui/patterns/media-carousel";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { ItemCard } from "~/features/catalog/item-card";
import { PlaylistCover } from "~/features/playlist/playlist-cover";
import { Avatar } from "~/features/shell/context-panel";
import { serverApi } from "~/server/api";

const loadProfile = cache(async (username: string) => {
  try {
    return await (await serverApi()).profile.byUsername({ username });
  } catch (error) {
    if ((isAppError(error) && error.code === "RESOURCE_NOT_FOUND") || (error instanceof Error && error.message === "This profile doesn't exist.")) {
      notFound();
    }
    throw error;
  }
});

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile(decodeURIComponent((await params).username));
  const name = profile.displayName ?? `@${profile.username}`;
  return { title: name, description: profile.bio ?? `${name}'s collection and playlists on Bandcoin.` };
}

/**
 * A fan's page. Smaller and quieter than an artist page on purpose: a
 * profile card, then what they collect (if public), their playlists and the
 * artists they follow.
 */
export default async function ProfilePage({ params }: Props) {
  const profile = await loadProfile(decodeURIComponent((await params).username));
  const name = profile.displayName ?? profile.username ?? "Fan";
  const since = profile.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <PageBody wide className="grid gap-12">
      <section className="bg-surface relative overflow-hidden rounded-[1.6rem] border-2">
        <div className="bg-primary/25 relative h-28 sm:h-36">
          {profile.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
            <img src={profile.coverUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-7">
          <Avatar
            name={name}
            url={profile.avatarUrl}
            className="bg-surface-3 border-surface -mt-12 grid size-24 shrink-0 place-items-center rounded-full border-4 object-cover text-2xl font-bold sm:size-28"
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <h1 className="display truncate text-3xl sm:text-4xl">{name}</h1>
            <p className="text-fg-muted text-sm">
              @{profile.username} · fan since {since}
            </p>
            {profile.bio && <p className="marker text-fg-muted -rotate-1 text-lg">{profile.bio}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {profile.artistSlug && (
              <Link href={`/artist/${profile.artistSlug}`} className="bg-primary text-primary-foreground flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold">
                <Mic2 className="size-4" /> Artist page
              </Link>
            )}
            {profile.isSelf && (
              <Link href="/settings" className="bg-surface-3 hover:bg-border-strong flex h-10 items-center rounded-full px-4 text-sm font-semibold">
                Edit profile
              </Link>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-3 border-t text-center">
          {[
            ["Owned", profile.stats.owned],
            ["Playlists", profile.stats.playlists],
            ["Following", profile.stats.following],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-0.5 py-3 [&:not(:first-child)]:border-l">
              <dd className="display text-2xl">{Number(value).toLocaleString()}</dd>
              <dt className="text-fg-muted text-xs font-semibold">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <Section title="Collection" note={profile.isSelf ? "what you own" : `what ${name} collects`}>
        {profile.collection === null ? (
          <p className="text-fg-muted flex items-center gap-2 text-sm">
            <Lock className="size-4" /> {name} keeps their collection private.
          </p>
        ) : profile.collection.length === 0 ? (
          <p className="text-fg-muted text-sm">Nothing collected yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {profile.collection.map((item) => (
              <ItemCard key={item.id} item={item} queue={profile.collection ?? []} />
            ))}
          </div>
        )}
      </Section>

      {profile.playlists.length > 0 && (
        <Section title="Playlists" note="press play">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {profile.playlists.map((playlist) => (
              <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group hover:bg-surface-2 grid content-start gap-2 rounded-xl p-2 transition-colors">
                <PlaylistCover covers={playlist.covers} className="shadow-md transition-transform duration-250 group-hover:-translate-y-0.5" />
                <span className="display truncate text-sm">{playlist.name}</span>
                <span className="text-fg-muted -mt-1.5 text-xs">
                  {playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {profile.following.length > 0 && (
        <Section title="Following" note="artists they back">
          <ul className="flex flex-wrap gap-4">
            {profile.following.map((artist) => (
              <li key={artist.slug}>
                <Link href={`/artist/${artist.slug}`} className="group grid w-24 justify-items-center gap-2 text-center">
                  <Avatar
                    name={artist.name}
                    url={artist.avatarUrl}
                    className="bg-surface-3 grid size-20 place-items-center rounded-full object-cover text-lg font-bold transition-transform group-hover:-translate-y-0.5"
                  />
                  <span className="display w-full truncate text-xs">{artist.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PageBody>
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
