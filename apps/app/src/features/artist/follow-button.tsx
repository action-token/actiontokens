"use client";

import { BadgeCheck, Loader2 as Loading } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { useArtistStanding, type Standing } from "./artist-standing";
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
  token?: { code: string; organizationId: string } | null;
  onFollowers?: (followers: number, subscribers: number) => void;
  onStanding?: (standing: { following: boolean; subscribed: boolean }) => void;
  /** A smaller button for lists; Subscribe shows there too when `token` is passed */
  compact?: boolean;
  /** On a dark photo (the artist banner): light text */
  onDark?: boolean;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  // On an artist's page every Follow button shares one state; elsewhere each keeps its own.
  const shared = useArtistStanding(slug);
  const [local, setLocal] = useState({ following: initial, subscribed: initialSubscribed });
  const { following, subscribed } = shared?.standing ?? local;
  const set = (patch: Partial<Standing>) =>
    shared
      ? shared.update(patch)
      : setLocal((now) => ({
          following: patch.following ?? now.following,
          subscribed: patch.subscribed ?? now.subscribed,
        }));
  const [offer, setOffer] = useState<TokenOffer | null>(null);
  const mutation = api.artist.setFollowing.useMutation({
    onSuccess: (result) => {
      set({
        following: result.following,
        subscribed: result.subscribed,
        followers: result.followers,
        subscribers: result.subscribers,
      });
      onFollowers?.(result.followers, result.subscribers);
      onStanding?.({ following: result.following, subscribed: result.subscribed });
    },
    onError: (error) => toast.error(error.message),
  });
  const canSubscribe = following && !subscribed && token !== null;

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
          className={compact ? "h-8 rounded-full px-3 text-xs" : "h-10 rounded-full px-5"}
          onClick={() => token && setOffer({ code: token.code, organizationId: token.organizationId })}
        >
          Subscribe
        </Button>
      )}
      <HoldTokenDialog
        offer={offer}
        onClose={() => setOffer(null)}
        onSubscribed={() => {
          set({ following: true, subscribed: true });
          onStanding?.({ following: true, subscribed: true });
        }}
      />
    </>
  );
}
