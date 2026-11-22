"use client";

import { BadgeCheck, Check, Loader2, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { HoldTokenDialog, type TokenOffer } from "./hold-token-dialog";

/**
 * Follow and Subscribe side by side, always both (artist lists and cards).
 * Same rules as `FollowButton`: following is free and toggles; subscribing opens the
 * fan-token price dialog, and a subscriber is a follower too (the server keeps one
 * follow row, marked not temporary). No fan token: Subscribe shows, disabled.
 * Signed out, either button opens sign-in.
 */
export function FollowSubscribe({
  slug,
  initialFollowing,
  initialSubscribed,
  token,
  onFollowers,
  onJoined,
  size = "sm",
  onDark = false,
  className,
}: {
  slug: string;
  initialFollowing: boolean;
  initialSubscribed: boolean;
  token: TokenOffer | null;
  /** The new follower count, after a follow or unfollow. */
  onFollowers?: (followers: number) => void;
  /** Subscribing made them a follower too (they weren't one): the count goes up by one. */
  onJoined?: () => void;
  /** sm: one compact row that fills the card, for circle cards. md: bigger buttons, for banners. */
  size?: "sm" | "md";
  onDark?: boolean;
  className?: string;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [following, setFollowing] = useState(initialFollowing);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [offer, setOffer] = useState<TokenOffer | null>(null);

  const mutation = api.artist.setFollowing.useMutation({
    onSuccess: (result) => {
      setFollowing(result.following);
      setSubscribed(result.subscribed);
      onFollowers?.(result.followers);
    },
    onError: (error) => toast.error(error.message),
  });

  const signedIn = status === "authenticated";
  const compact = size === "sm";
  // sm: side by side, each taking half; too narrow for both and they wrap, one under the other.
  const button = compact
    ? "h-8 min-w-[4.5rem] flex-1 rounded-full px-2.5 text-xs whitespace-nowrap"
    : "h-10 rounded-full px-5";
  const darkOutline =
    onDark && "border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white";

  return (
    <div
      className={cn(
        compact ? "flex w-full flex-wrap gap-1.5" : "flex flex-wrap items-center gap-2.5",
        className,
      )}
    >
      <Button
        variant={following ? "outline" : "secondary"}
        className={cn(button, following && darkOutline)}
        disabled={mutation.isPending}
        aria-pressed={following}
        onClick={() =>
          signedIn ? mutation.mutate({ slug, following: !following }) : openSignIn(true)
        }
      >
        {mutation.isPending ? (
          <Loader2 className="animate-spin" />
        ) : compact ? null : following ? (
          <Check />
        ) : (
          <Plus />
        )}
        {following ? "Following" : "Follow"}
      </Button>

      {subscribed ? (
        <Button
          variant="outline"
          className={cn(button, darkOutline, "cursor-default")}
          title={token ? `You hold ${token.code}` : undefined}
          tabIndex={-1}
        >
          <BadgeCheck className="text-primary-text" /> Subscribed
        </Button>
      ) : (
        <Button
          className={button}
          disabled={!token}
          title={
            token
              ? `Hold ${token.code} to open their subscriber posts and perks`
              : "This organization has no fan token yet"
          }
          onClick={() => {
            if (!token) return;
            if (!signedIn) openSignIn(true);
            else setOffer(token);
          }}
        >
          Subscribe
        </Button>
      )}

      <HoldTokenDialog
        offer={offer}
        onClose={() => setOffer(null)}
        onSubscribed={() => {
          setSubscribed(true);
          if (!following) {
            setFollowing(true);
            onJoined?.();
          }
        }}
      />
    </div>
  );
}
