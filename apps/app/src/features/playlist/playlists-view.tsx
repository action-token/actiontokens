"use client";

import { ListMusic, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { PlaylistCover } from "./playlist-cover";
import { PlaylistFormDialog } from "./playlist-form-dialog";

/** Your playlists as a grid of covers, with "New playlist" first. */
export function PlaylistsView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [creating, setCreating] = useState(false);
  const mine = api.playlist.mine.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "unauthenticated") {
    return (
      <EmptyState
        icon={ListMusic}
        title="Sign in to make playlists"
        description="Put any song in a playlist. Songs you own play in full, the rest as previews."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="hover:border-primary-text text-fg-muted hover:text-fg grid aspect-square place-items-center content-center gap-2 rounded-xl border-2 border-dashed transition-colors"
        >
          <span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-full">
            <Plus className="size-6" />
          </span>
          <span className="display text-base">New playlist</span>
        </button>
        {mine.isPending
          ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-xl" />)
          : mine.data?.map((playlist) => (
              <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group hover:bg-surface-2 grid content-start gap-2 rounded-xl p-2 transition-colors">
                <PlaylistCover covers={playlist.covers} className="shadow-md transition-transform duration-250 group-hover:-translate-y-0.5" />
                <span className="display flex items-center gap-1.5 truncate text-sm">
                  {!playlist.isPublic && <Lock className="size-3.5 shrink-0" />}
                  {playlist.name}
                </span>
                <span className="text-fg-muted -mt-1.5 text-xs">
                  {playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"}
                </span>
              </Link>
            ))}
      </div>
      {creating && <PlaylistFormDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
