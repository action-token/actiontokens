"use client";

import { BadgeCheck, Loader2 as Loading } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { HoldTokenDialog, type TokenOffer } from "./hold-token-dialog";

/**
 * Follow / Following / Subscribed. Following is free; a fan who also trusts the
 * artist's fan token is a subscriber. On an artist with a fan token, a follower
 * gets a Subscribe button that opens the price dialog. Signed out, Follow opens
 * sign-in. The count updates in place.
 */
export function FollowButton({
  slug,
  initial,
  initialSubscribed = false,
  token = null,
  onFollowers,
  onStanding,
  compact = false,
  onDark = false,
}: {
  slug: string;
  initial: boolean;
  initialSubscribed?: boolean;
  /** The artist's fan token, when they have one (it is what a fan trusts to subscribe) */
  token?: { code: string; artistId: string } | null;
  onFollowers?: (followers: number, subscribers: number) => void;
  onStanding?: (standing: { following: boolean; subscribed: boolean }) => void;
  /** A smaller button for lists; no Subscribe button */
  compact?: boolean;
  /** On a dark photo (the artist banner): light text */
  onDark?: boolean;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [following, setFollowing] = useState(initial);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [offer, setOffer] = useState<TokenOffer | null>(null);
  const mutation = api.artist.setFollowing.useMutation({
    onSuccess: (result) => {
      setFollowing(result.following);
      setSubscribed(result.subscribed);
      onFollowers?.(result.followers, result.subscribers);
      onStanding?.({ following: result.following, subscribed: result.subscribed });
    },
    onError: (error) => toast.error(error.message),
  });
  const canSubscribe = !compact && following && !subscribed && token !== null;

  return (
    <>
      <Button
        variant={following ? "outline" : "secondary"}
        className={cn(
          compact ? "h-8 rounded-full px-3 text-xs" : "h-10 rounded-full px-5",
          onDark &&
            following &&
            "border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white",
        )}
        disabled={mutation.isPending}
        title={subscribed ? `Subscribed: you trust ${token?.code ?? "their fan token"}` : undefined}
        onClick={() =>
          status === "authenticated"
            ? mutation.mutate({ slug, following: !following })
            : openSignIn(true)
        }
      >
        {mutation.isPending && <Loading className="animate-spin" />}
        {subscribed && !mutation.isPending && <BadgeCheck className="text-primary-text" />}
        {subscribed ? "Subscribed" : following ? "Following" : "Follow"}
      </Button>
      {canSubscribe && (
        <Button
          className="h-10 rounded-full px-5"
          onClick={() => token && setOffer({ code: token.code, artistId: token.artistId })}
        >
          Subscribe
        </Button>
      )}
      <HoldTokenDialog
        offer={offer}
        onClose={() => setOffer(null)}
        onSubscribed={() => {
          setSubscribed(true);
          onStanding?.({ following: true, subscribed: true });
        }}
      />
    </>
  );
}
