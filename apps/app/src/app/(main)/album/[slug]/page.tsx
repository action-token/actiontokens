import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { isAppError } from "@bandcoin/errors";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { PlayAllButton, TrackList } from "~/features/music/track-list";
import { Avatar } from "~/features/shell/context-panel";
import { serverApi } from "~/server/api";

const loadAlbum = cache(async (slug: string) => {
  try {
    return await (await serverApi()).music.album({ slug });
  } catch (error) {
    if (
      (isAppError(error) && error.code === "RESOURCE_NOT_FOUND") ||
      (error instanceof Error && error.message === "This album doesn't exist.")
    ) {
      notFound();
    }
    throw error;
  }
});

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const album = await loadAlbum((await params).slug);
  const by = album.artist?.name ?? "Bandcoin";
  return {
    title: `${album.title} by ${by}`,
    description: album.description ?? `${album.title}, an album by ${by} on Bandcoin.`,
    openGraph: { images: [album.coverUrl] },
  };
}

const length = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
};

/** An album: the cover and facts over a wash of its colours, Play all, then the songs in order. */
export default async function AlbumPage({ params }: Props) {
  const album = await loadAlbum((await params).slug);

  return (
    <>
      <section className="relative isolate overflow-hidden border-b">
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img
          src={album.coverUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-30 blur-3xl"
        />
        <div aria-hidden className="from-bg/0 to-bg absolute inset-0 -z-10 bg-gradient-to-b" />
        <div className="mx-auto flex max-w-[80rem] flex-col gap-6 px-4 pt-8 pb-6 sm:flex-row sm:items-end sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
          <img
            src={album.coverUrl}
            alt={album.title}
            className="aspect-square w-48 shrink-0 rounded-xl object-cover shadow-[8px_10px_0_0_var(--color-primary)] sm:w-56"
          />
          <div className="grid min-w-0 gap-2">
            <span className="text-fg-muted text-xs font-bold tracking-wider uppercase">Album</span>
            <h1 className="display text-5xl break-words sm:text-7xl">{album.title}</h1>
            <p className="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {album.artist && (
                <Link
                  href={`/artist/${album.artist.slug}`}
                  className="text-fg flex items-center gap-2 font-semibold hover:underline"
                >
                  <Avatar
                    name={album.artist.name}
                    url={album.artist.avatarUrl}
                    className="bg-surface-3 grid size-6 place-items-center rounded-full object-cover text-[9px] font-bold"
                  />
                  {album.artist.name}
                </Link>
              )}
              <span>· {album.year}</span>
              <span>
                · {album.tracks.length} {album.tracks.length === 1 ? "song" : "songs"}
                {album.durationSec > 0 && `, ${length(album.durationSec)}`}
              </span>
            </p>
            {album.description && (
              <p className="marker text-fg-muted -rotate-1 text-lg">{album.description}</p>
            )}
          </div>
        </div>
      </section>

      <PageBody wide className="grid gap-5">
        <PlayAllButton tracks={album.tracks} shuffle />
        {album.tracks.length > 0 ? (
          <TrackList tracks={album.tracks} />
        ) : (
          <p className="text-fg-muted text-sm">No songs on this album yet.</p>
        )}
      </PageBody>
    </>
  );
}
