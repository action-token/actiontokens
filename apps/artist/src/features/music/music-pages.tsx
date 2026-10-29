"use client";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { AlbumForm } from "./album-form";
import { SongForm } from "./song-form";

export const NewSongView = ({ albumId }: { albumId?: string }) => (
  <SongForm defaultAlbumId={albumId} />
);

export function EditSongView({ itemId }: { itemId: string }) {
  const song = api.music.song.useQuery({ itemId });
  if (song.data) return <SongForm existing={song.data} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/music", label: "Music" }} eyebrow="Catalog" title="Edit song" />
      {song.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : (
        <ErrorState
          message={song.error?.message ?? "Couldn't load this song."}
          onRetry={() => void song.refetch()}
        />
      )}
    </PageBody>
  );
}

export const NewAlbumView = () => <AlbumForm />;

export function EditAlbumView({ albumId }: { albumId: string }) {
  const albums = api.music.albums.useQuery();
  const album = albums.data?.find((entry) => entry.id === albumId);
  if (album) return <AlbumForm existing={album} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={{ href: "/music?tab=albums", label: "Albums" }}
        eyebrow="Catalog"
        title="Edit album"
      />
      {albums.isPending ? (
        <Skeleton className="h-72 w-full max-w-2xl rounded-xl" />
      ) : (
        <ErrorState message="Album not found." />
      )}
    </PageBody>
  );
}
