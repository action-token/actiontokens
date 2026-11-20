"use client";

import { ExternalLink, Eye, Loader2, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";
import { cardImages } from "./card-images";

export type BountyCardData = RouterOutputs["bounty"]["list"]["items"][number];

/** "2 left", "Paused" or "Ended", as the old card's corner pill. */
export function slotLabel(bounty: Pick<BountyCardData, "status" | "maxWinners" | "winners">) {
  if (bounty.status === "COMPLETED") return "Ended";
  if (bounty.status === "PAUSED") return "Paused";
  return `${Math.max(0, bounty.maxWinners - bounty.winners)} left`;
}

/**
 * A bounty in the grid (same content as the old Bandcoin card): the prize
 * (linked to the asset on Stellar Expert) and how many winners share it,
 * slots left, title, a 250-character brief and who posted it, over its images
 * (see cardImages). Join right from the card, or View once you're in.
 */
export function BountyCard({ bounty }: { bounty: BountyCardData }) {
  const router = useRouter();
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const utils = api.useUtils();
  const join = api.bounty.join.useMutation({
    onSuccess: async () => {
      await utils.bounty.list.invalidate();
      router.push(`/bounty/${bounty.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const images = cardImages(bounty);
  const canJoin = !bounty.joined && !bounty.isCreator && bounty.status === "RUNNING";
  const href = `/bounty/${bounty.id}`;

  return (
    <article className="group bg-surface hover:border-fg relative isolate flex min-h-64 flex-col overflow-hidden rounded-[1.4rem] border-2 p-5 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[6px_7px_0_0_var(--color-primary)]">
      {images.length > 0 && (
        <div aria-hidden className="absolute inset-0 -z-10 flex">
          {images.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
            <img
              key={`${url}-${index}`}
              src={url}
              alt=""
              className="h-full min-w-0 flex-1 object-cover opacity-60"
            />
          ))}
          <div className="from-surface/85 via-surface/75 to-surface/95 absolute inset-0 bg-gradient-to-b" />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <span className="bg-primary text-primary-foreground -ml-1 inline-flex -rotate-2 flex-wrap items-baseline gap-x-1.5 rounded-xl px-2.5 py-1 transition-transform duration-200 group-hover:rotate-0">
          <Money
            amount={bounty.prize.amount}
            currency={bounty.prize.currency}
            code={bounty.prize.code}
            short
            onBrand
            className="display text-2xl leading-none"
          />
          <a
            href={bounty.prize.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`View ${bounty.prize.currency} on Stellar Expert`}
            className="relative z-10 inline-flex items-center gap-0.5 text-[11px] font-bold opacity-80 hover:opacity-100"
          >
            {bounty.prize.currency}
            <ExternalLink className="size-2.5" />
          </a>
          <span className="marker text-sm">
            / {bounty.maxWinners > 1 ? `${bounty.maxWinners} winners` : "winner"}
          </span>
        </span>
        <span className="bg-surface-2 text-fg-muted shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold whitespace-nowrap">
          {slotLabel(bounty)}
        </span>
      </div>

      <h3 className="display mt-4 line-clamp-2 text-2xl leading-tight break-words">
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          {bounty.title}
        </Link>
      </h3>
      <p className="text-fg-muted mt-2 mb-4 line-clamp-4 min-h-[3.5rem] text-[13.5px] leading-relaxed">
        {bounty.text}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
        <Link
          href={`/artist/${bounty.artist.slug}`}
          className="text-fg-muted hover:text-fg relative z-10 flex min-w-0 items-center gap-2 text-xs"
        >
          <Avatar
            name={bounty.artist.name}
            url={bounty.artist.avatarUrl}
            className="bg-surface-3 grid size-6 shrink-0 place-items-center rounded-full object-cover text-[9px] font-bold"
          />
          <span className="truncate">By {bounty.artist.name}</span>
        </Link>

        {canJoin ? (
          <button
            type="button"
            disabled={join.isPending}
            onClick={() =>
              status === "authenticated" ? join.mutate({ bountyId: bounty.id }) : openSignIn(true)
            }
            className="bg-fg text-bg relative z-10 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform hover:scale-105 disabled:opacity-60"
          >
            {join.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Users className="size-3.5" />
            )}
            {join.isPending ? "Joining…" : "Join"}
          </button>
        ) : (
          (bounty.joined || bounty.isCreator) && (
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold">
              <Eye className="size-3.5" /> View
            </span>
          )
        )}
      </div>
    </article>
  );
}

export function BountyCardSkeleton() {
  return (
    <div className="bg-surface grid min-h-64 content-start gap-3 rounded-[1.4rem] border-2 p-5">
      <div className="flex justify-between">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-5 w-4/5" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-3/5" />
      <Skeleton className="mt-6 h-6 w-32" />
    </div>
  );
}
