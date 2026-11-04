"use client";

import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { HoldTokenDialog, type TokenOffer } from "./hold-token-dialog";

/** Follow / Following. Signed out, it opens sign-in. The count updates in place. */
export function FollowButton({
  slug,
  initial,
  onFollowers,
}: {
  slug: string;
  initial: boolean;
  onFollowers?: (followers: number) => void;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [following, setFollowing] = useState(initial);
  const [offer, setOffer] = useState<TokenOffer | null>(null);
  const mutation = api.artist.setFollowing.useMutation({
    onSuccess: (result) => {
      setFollowing(result.following);
      onFollowers?.(result.followers);
      // A fan token to offer, shown once they've followed (they can say "Not now").
      if (result.fanToken) setOffer(result.fanToken);
    },
  });

  return (
    <>
      <Button
        variant={following ? "outline" : "secondary"}
        className="h-10 rounded-full px-5"
        disabled={mutation.isPending}
        onClick={() =>
          status === "authenticated"
            ? mutation.mutate({ slug, following: !following })
            : openSignIn(true)
        }
      >
        {mutation.isPending && <Loader2 className="animate-spin" />}
        {following ? "Following" : "Follow"}
      </Button>
      <HoldTokenDialog offer={offer} onClose={() => setOffer(null)} />
    </>
  );
}
