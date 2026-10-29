"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { formatDuration } from "@bandcoin/utils/preview";

import { api } from "~/trpc/react";

import { AlbumForm } from "./album-form";
import { SongForm } from "./song-form";

export function NewSongView({ albumId }: { albumId?: string }) {
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: albumId ? `/music/albums/${albumId}` : "/music", label: albumId ? "Album" : "Music" }} eyebrow="Catalog" title="New song" description="Upload the recording, choose where the 30-second preview starts, and set the price." />
      <SongForm defaultAlbumId={albumId} />
    </PageBody>
  );
}

export function EditSongView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const song = api.music.song.useQuery({ itemId });
  const [deleting, setDeleting] = useState(false);
  const remove = api.catalog.remove.useMutation({
    onSuccess: () => {
      toast.success("Song deleted");
      void utils.music.songs.invalidate();
      router.push("/music");
    },
    onError: (error) => {
      setDeleting(false);
      toast.error(error.message);
    },
  });

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={{ href: "/music", label: "Music" }}
        eyebrow="Catalog"
        title={song.data?.title ?? "Edit song"}
        actions={
          song.data && (
            <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          )
        }
      />
      {song.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : song.isError ? (
        <ErrorState message={song.error.message} onRetry={() => void song.refetch()} />
      ) : (
        <>
          <SongForm existing={song.data} />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete ${song.data.title}?`}
            description={song.data.locked ? "This song has sales, so it can't be deleted. Unpublish it to hide it instead." : "It disappears from your page. This can't be undone."}
            confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
            busy={remove.isPending}
            onConfirm={() => remove.mutate({ itemId })}
          />
        </>
      )}
    </PageBody>
  );
}

export function NewAlbumView() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/music?tab=albums", label: "Albums" }} eyebrow="Catalog" title="New album" description="Give it a title and a cover. You add the songs next." />
      <AlbumForm />
    </PageBody>
  );
}

export function EditAlbumView({ albumId }: { albumId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const albums = api.music.albums.useQuery();
  const songs = api.music.songs.useQuery();
  const [deleting, setDeleting] = useState(false);
  const remove = api.music.removeAlbum.useMutation({
    onSuccess: () => {
      toast.success("Album deleted. Its songs are still yours.");
      void utils.music.albums.invalidate();
      void utils.music.songs.invalidate();
      router.push("/music?tab=albums");
    },
    onError: (error) => {
      setDeleting(false);
      toast.error(error.message);
    },
  });
  const album = albums.data?.find((entry) => entry.id === albumId);
  const inAlbum = (songs.data ?? []).filter((song) => song.albumId === albumId).sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={{ href: "/music?tab=albums", label: "Albums" }}
        eyebrow="Catalog"
        title={album?.title ?? "Edit album"}
        actions={
          album && (
            <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          )
        }
      />
      {albums.isPending ? (
        <Skeleton className="h-72 w-full max-w-2xl rounded-xl" />
      ) : !album ? (
        <ErrorState message="Album not found." />
      ) : (
        <>
          <AlbumForm existing={album} />
          <section className="bg-surface grid max-w-2xl gap-3 rounded-xl border p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="display text-lg">Songs</h2>
              <Button asChild size="sm">
                <Link href={`/music/new?album=${albumId}`}>
                  <Plus /> Add a song
                </Link>
              </Button>
            </div>
            {inAlbum.length === 0 ? (
              <p className="text-fg-muted text-sm">No songs yet. Add one here, or choose this album when you edit a song.</p>
            ) : (
              <ol className="divide-y">
                {inAlbum.map((song) => (
                  <li key={song.id}>
                    <Link href={`/music/${song.id}`} className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-sm">
                      <span className="text-fg-faint num w-6 text-right">{song.trackNumber ?? "–"}</span>
                      <b className="min-w-0 flex-1 truncate">{song.title}</b>
                      <span className="text-fg-muted num">{song.durationSec ? formatDuration(song.durationSec) : ""}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete ${album.title}?`}
            description="Only the album goes. Its songs stay and become singles."
            confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
            busy={remove.isPending}
            onConfirm={() => remove.mutate({ albumId })}
          />
        </>
      )}
    </PageBody>
  );
}
