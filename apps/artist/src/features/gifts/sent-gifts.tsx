"use client";

import { Gift } from "lucide-react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { Avatar } from "@bandcoin/ui/patterns/person";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

/** Token and NFT gifts you've sent, newest first. */
export function SentGifts() {
  const sent = api.gifts.sent.useQuery();
  return (
    <section className="grid gap-3">
      <h2 className="display text-lg">Sent gifts</h2>
      {sent.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : sent.isError ? (
        <ErrorState message="Couldn't load your gifts." onRetry={() => void sent.refetch()} />
      ) : sent.data.length === 0 ? (
        <EmptyState icon={Gift} title="No gifts yet" description="Gifts you send show up here." />
      ) : (
        <ul className="bg-surface divide-y overflow-hidden rounded-[1.4rem] border-2">
          {sent.data.map((gift) => (
            <li key={gift.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar src={gift.recipient.image} name={gift.recipient.name} className="size-9" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium">{gift.recipient.name ?? "Fan"}</span>
                <span className="text-fg-muted text-xs">{timeAgo(gift.createdAt)}</span>
              </span>
              <span className="num text-right text-sm font-semibold">
                {gift.tokens
                  ? `${gift.tokens.amount.toLocaleString()} ${gift.tokens.code}`
                  : gift.copy
                    ? `${gift.copy.title} #${gift.copy.tokenId}`
                    : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
