"use client";

import { ListPlus, Loader2, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
import { cn } from "@bandcoin/ui/lib/cn";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { PlaylistFormDialog } from "./playlist-form-dialog";

/** "Add to playlist": pick one of yours or start a new one with this song. Signed out, it opens sign-in. */
export function AddToPlaylist({
  itemId,
  title,
  variant = "icon",
  className,
}: {
  itemId: string;
  title: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const mine = api.playlist.mine.useQuery(undefined, {
    enabled: open && status === "authenticated",
  });
  const utils = api.useUtils();
  const add = api.playlist.addTrack.useMutation({
    onSuccess: async (_result, input) => {
      const name =
        mine.data?.find((playlist) => playlist.id === input.playlistId)?.name ?? "playlist";
      toast.success(`Added to ${name}`);
      await utils.playlist.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const trigger =
    variant === "icon" ? (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Add ${title} to a playlist`}
        className={className}
      >
        {add.isPending ? <Loader2 className="animate-spin" /> : <ListPlus />}
      </Button>
    ) : (
      <Button variant="secondary" className={cn("rounded-full", className)}>
        {add.isPending ? <Loader2 className="animate-spin" /> : <ListPlus />}{" "}
        {add.isPending ? "Adding…" : "Add to playlist"}
      </Button>
    );

  if (status !== "authenticated") {
    return (
      <span
        onClick={(event) => {
          event.stopPropagation();
          openSignIn(true);
        }}
      >
        {trigger}
      </span>
    );
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
          {trigger}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-60"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className="text-fg-muted text-xs">Add to playlist</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New playlist
          </DropdownMenuItem>
          {(mine.data?.length ?? 0) > 0 && <DropdownMenuSeparator />}
          {mine.isPending && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
          {mine.data?.map((playlist) => (
            <DropdownMenuItem
              key={playlist.id}
              disabled={add.isPending}
              onSelect={() => add.mutate({ playlistId: playlist.id, itemId })}
            >
              <span className="truncate">{playlist.name}</span>
              <span className="text-fg-faint ml-auto text-xs">{playlist.trackCount}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {creating && (
        <PlaylistFormDialog open={creating} onOpenChange={setCreating} firstItemId={itemId} />
      )}
    </>
  );
}
