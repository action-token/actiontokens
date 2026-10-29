"use client";

import { ListMusic, Lock, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";

import { api } from "~/trpc/react";

import { PlayAllButton, TrackList } from "../music/track-list";
import { Avatar } from "../shell/context-panel";
import { PlaylistCover } from "./playlist-cover";
import { PlaylistFormDialog } from "./playlist-form-dialog";

const length = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
};

/**
 * One playlist. Everyone can play it (owned songs in full, others as
 * previews); its owner can rename it, make it private, remove songs or
 * delete it. Loads in the browser because private playlists depend on who
 * is signed in.
 */
export function PlaylistView({ playlistId }: { playlistId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const playlist = api.playlist.byId.useQuery({ playlistId }, { retry: false });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = api.playlist.removeTrack.useMutation({
    onSuccess: () => utils.playlist.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const destroy = api.playlist.delete.useMutation({
    onSuccess: async () => {
      await utils.playlist.invalidate();
      toast.success("Playlist deleted");
      router.push("/playlists");
    },
    onError: (error) => toast.error(error.message),
  });

  if (playlist.isPending) {
    return (
      <div className="mx-auto grid max-w-[80rem] gap-6 px-4 pt-8 sm:px-8">
        <div className="flex items-end gap-6">
          <Skeleton className="size-48 rounded-xl" />
          <div className="grid flex-1 gap-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
    );
  }
  if (!playlist.data) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16">
        <EmptyState
          icon={ListMusic}
          title="Playlist not found"
          description="It may be private, or it was deleted."
          action={
            <Button asChild variant="secondary">
              <Link href="/playlists">Your playlists</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const data = playlist.data;
  const ownerName = data.owner.displayName ?? data.owner.username ?? "A fan";

  return (
    <>
      <section className="relative isolate overflow-hidden border-b">
        {data.covers[0] && (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
          <img
            src={data.covers[0]}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-30 blur-3xl"
          />
        )}
        <div
          aria-hidden
          className="to-bg absolute inset-0 -z-10 bg-gradient-to-b from-transparent"
        />
        <div className="mx-auto flex max-w-[80rem] flex-col gap-6 px-4 pt-8 pb-6 sm:flex-row sm:items-end sm:px-8">
          <PlaylistCover
            covers={data.covers}
            className="w-48 shrink-0 rounded-xl shadow-[8px_10px_0_0_var(--color-primary)] sm:w-56"
          />
          <div className="grid min-w-0 gap-2">
            <span className="text-fg-muted flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase">
              {!data.isPublic && <Lock className="size-3.5" />}
              {data.isPublic ? "Playlist" : "Private playlist"}
            </span>
            <h1 className="display text-4xl break-words sm:text-6xl">{data.name}</h1>
            {data.description && (
              <p className="marker text-fg-muted -rotate-1 text-lg">{data.description}</p>
            )}
            <p className="text-fg-muted flex flex-wrap items-center gap-x-2 text-sm">
              {data.owner.username ? (
                <Link
                  href={`/u/${data.owner.username}`}
                  className="text-fg flex items-center gap-2 font-semibold hover:underline"
                >
                  <Avatar
                    name={ownerName}
                    url={data.owner.avatarUrl}
                    className="bg-surface-3 grid size-6 place-items-center rounded-full object-cover text-[9px] font-bold"
                  />
                  {ownerName}
                </Link>
              ) : (
                <span className="text-fg font-semibold">{ownerName}</span>
              )}
              <span>
                · {data.tracks.length} {data.tracks.length === 1 ? "song" : "songs"}
                {data.durationSec > 0 && `, ${length(data.durationSec)}`}
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[80rem] gap-5 px-4 pt-6 sm:px-8">
        <div className="flex items-center gap-3">
          <PlayAllButton tracks={data.tracks} shuffle />
          {data.isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Playlist options">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-danger">
                  <Trash2 /> Delete playlist
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {data.tracks.length === 0 ? (
          <EmptyState
            icon={ListMusic}
            title="No songs yet"
            description={
              data.isOwner
                ? "Use “Add to playlist” on any song to put it here."
                : "Nothing here yet."
            }
            action={
              data.isOwner ? (
                <Button asChild variant="secondary">
                  <Link href="/">Find songs</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TrackList
            tracks={data.tracks}
            actionFor={
              data.isOwner
                ? (track) => (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${track.title} from this playlist`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ playlistId, itemId: track.id })}
                    >
                      <X />
                    </Button>
                  )
                : undefined
            }
          />
        )}
      </div>

      {editing && (
        <PlaylistFormDialog
          open={editing}
          onOpenChange={setEditing}
          playlist={{
            id: data.id,
            name: data.name,
            description: data.description,
            isPublic: data.isPublic,
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${data.name}”?`}
        description="The playlist goes away for good. The songs stay where they are."
        confirmLabel="Delete"
        destructive
        onConfirm={() => destroy.mutate({ playlistId })}
      />
    </>
  );
}
