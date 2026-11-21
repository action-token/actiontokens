import { Lock, Mic2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { isAppError } from "@actiontokens/errors";
import { SectionTitle } from "@actiontokens/ui/patterns/media-carousel";
import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { ItemCard } from "~/features/catalog/item-card";
import { PlaylistCover } from "~/features/playlist/playlist-cover";
import { Avatar } from "~/features/shell/context-panel";
import { serverApi } from "~/server/api";

const loadProfile = cache(async (username: string) => {
  try {
    return await (await serverApi()).profile.byUsername({ username });
  } catch (error) {
    if (
      (isAppError(error) && error.code === "RESOURCE_NOT_FOUND") ||
      (error instanceof Error && error.message === "This profile doesn't exist.")
    ) {
      notFound();
    }
    throw error;
  }
});

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile(decodeURIComponent((await params).username));
  const name = profile.displayName ?? `@${profile.username}`;
  return {
    title: name,
    description: profile.bio ?? `${name}'s collection and playlists on Action Tokens.`,
  };
}

/**
 * A fan's page: a full-width banner (their cover, else a blur of their
 * avatar) with name, stats and actions, then what they collect (if public),
 * their playlists and the artists they follow.
 */
export default async function ProfilePage({ params }: Props) {
  const profile = await loadProfile(decodeURIComponent((await params).username));
  const name = profile.displayName ?? profile.username ?? "Fan";
  const since = profile.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <>
      <section className="bleed relative isolate flex min-h-[280px] items-end overflow-hidden text-white sm:min-h-[320px]">
        {profile.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img
            src={profile.coverUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full object-cover"
          />
        ) : profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img
            src={profile.avatarUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full scale-125 object-cover blur-2xl"
          />
        ) : (
          <div aria-hidden className="bg-primary absolute inset-0 -z-20" />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
        />
        <div className="grid w-full max-w-[var(--page-max,96rem)] gap-5 px-4 pt-16 pb-7 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <Avatar
              name={name}
              url={profile.avatarUrl}
              className="bg-surface-3 text-fg grid size-24 shrink-0 place-items-center rounded-full border-4 border-white object-cover text-3xl font-bold shadow-xl lg:size-32"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="marker -rotate-1 text-lg text-white/80">*fan*</span>
              <h1 className="display text-5xl break-words sm:text-6xl xl:text-7xl">{name}</h1>
              <p className="text-sm text-white/75">
                @{profile.username} · fan since {since}
              </p>
              {profile.bio && (
                <p className="marker max-w-2xl -rotate-1 text-lg text-white/85">{profile.bio}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <dl className="flex gap-6">
              {[
                ["Owned", profile.stats.owned],
                ["Playlists", profile.stats.playlists],
                ["Following", profile.stats.following],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-xs font-semibold text-white/70">{label}</dt>
                  <dd className="display text-3xl">{Number(value).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {profile.artistSlug && (
                <Link
                  href={`/artist/${profile.artistSlug}`}
                  className="bg-primary text-primary-foreground flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  <Mic2 className="size-4" /> Artist page
                </Link>
              )}
              {profile.isSelf && (
                <Link
                  href="/settings"
                  className="flex h-10 items-center rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur hover:bg-white/25"
                >
                  Edit profile
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <PageBody wide className="grid gap-12">
        <Section
          title="Collection"
          note={profile.isSelf ? "what you own" : `what ${name} collects`}
        >
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
                <Link
                  key={playlist.id}
                  href={`/playlist/${playlist.id}`}
                  className="group hover:bg-surface-2 grid content-start gap-2 rounded-xl p-2 transition-colors"
                >
                  <PlaylistCover
                    covers={playlist.covers}
                    className="shadow-md transition-transform duration-250 group-hover:-translate-y-0.5"
                  />
                  <span className="display truncate text-lg">{playlist.name}</span>
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
                  <Link
                    href={`/artist/${artist.slug}`}
                    className="group grid w-24 justify-items-center gap-2 text-center"
                  >
                    <Avatar
                      name={artist.name}
                      url={artist.avatarUrl}
                      className="bg-surface-3 grid size-20 place-items-center rounded-full object-cover text-lg font-bold transition-transform group-hover:-translate-y-0.5"
                    />
                    <span className="display w-full truncate text-base">{artist.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
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
