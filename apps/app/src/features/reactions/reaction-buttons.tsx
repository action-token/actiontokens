"use client";

import { Loader2, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

import { cn } from "@bandcoin/ui/lib/cn";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

/** The API takes at most this many items per states request. */
const STATES_PAGE = 100;

const EMPTY = { likes: 0, dislikes: 0, liked: false, disliked: false, favorite: false };

/**
 * Like, dislike and favourite for one song. In a list, pass the list's ids:
 * every row asks for the same page of ids, so the whole list shares one request.
 */
export function ReactionButtons({
  itemId,
  listIds,
  tone = "default",
  showCounts = true,
  className,
}: {
  itemId: string;
  /** The ids of the list this button sits in (defaults to just this item) */
  listIds?: string[];
  /** "onDark" for the item page's dark banner */
  tone?: "default" | "onDark";
  showCounts?: boolean;
  className?: string;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const utils = api.useUtils();

  const ids = listIds ?? [itemId];
  const start = Math.floor(Math.max(0, ids.indexOf(itemId)) / STATES_PAGE) * STATES_PAGE;
  const page = ids.slice(start, start + STATES_PAGE);
  const states = api.reaction.states.useQuery({ itemIds: page }, { staleTime: 60_000 });
  const state = states.data?.[itemId] ?? EMPTY;

  const refresh = () => utils.reaction.states.invalidate();
  const failed = (error: { message: string }) => toast.error(error.message || "Couldn't save that. Try again.");
  // The button stays in its spinner until the new numbers are back, so the click never looks ignored.
  const like = api.reaction.setLike.useMutation({ onSuccess: refresh, onError: failed });
  const dislike = api.reaction.setDislike.useMutation({ onSuccess: refresh, onError: failed });
  const favorite = api.reaction.setFavorite.useMutation({
    onSuccess: async () => {
      await Promise.all([refresh(), utils.collection.favorites.invalidate()]);
    },
    onError: failed,
  });
  const busy = like.isPending || dislike.isPending || favorite.isPending;

  const act = (run: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (status !== "authenticated") return openSignIn(true);
    run();
  };

  const button = cn(
    "inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors disabled:opacity-60",
    tone === "onDark" ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-fg-muted hover:bg-surface-3 hover:text-fg",
  );
  const on = tone === "onDark" ? "text-white" : "text-primary-text";

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} onKeyDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={state.liked ? "Remove like" : "Like"}
        aria-pressed={state.liked}
        disabled={busy}
        onClick={act(() => like.mutate({ itemId, on: !state.liked }))}
        className={cn(button, state.liked && on)}
      >
        {like.isPending ? <Spinner /> : <ThumbsUp className={cn("size-4", state.liked && "fill-current")} />}
        {showCounts && <span className="num">{state.likes.toLocaleString()}</span>}
      </button>
      <button
        type="button"
        aria-label={state.disliked ? "Remove dislike" : "Dislike"}
        aria-pressed={state.disliked}
        disabled={busy}
        onClick={act(() => dislike.mutate({ itemId, on: !state.disliked }))}
        className={cn(button, state.disliked && on)}
      >
        {dislike.isPending ? <Spinner /> : <ThumbsDown className={cn("size-4", state.disliked && "fill-current")} />}
        {showCounts && <span className="num">{state.dislikes.toLocaleString()}</span>}
      </button>
      <button
        type="button"
        aria-label={state.favorite ? "Remove from favourites" : "Add to favourites"}
        aria-pressed={state.favorite}
        disabled={busy}
        onClick={act(() => favorite.mutate({ itemId, on: !state.favorite }))}
        className={cn(button, state.favorite && on)}
      >
        {favorite.isPending ? <Spinner /> : <Star className={cn("size-4", state.favorite && "fill-current")} />}
      </button>
    </span>
  );
}

const Spinner = () => <Loader2 aria-hidden className="size-4 animate-spin" />;
