"use client";

import { Gift, Loader2 } from "lucide-react";

import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { Avatar } from "@actiontokens/ui/patterns/person";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { ClaimToast, useClaimFlow } from "../wallet/use-claim-flow";

type SentGift = RouterOutputs["gifts"]["sent"][number];

/**
 * Token and NFT gifts you've sent, newest first. A token gift the fan hasn't
 * accepted yet is "Waiting to be accepted" (or "Declined", if they said no)
 * and can be taken back.
 */
export function SentGifts() {
  const sent = api.gifts.sent.useQuery();
  const flow = useGiftTakeBack();
  return (
    <section className="grid gap-3" aria-label="Sent gifts">
      {sent.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : sent.isError ? (
        <ErrorState message="Couldn't load your gifts." onRetry={() => void sent.refetch()} />
      ) : sent.data.length === 0 ? (
        <EmptyState icon={Gift} title="No gifts yet" description="Gifts you send show up here." />
      ) : (
        <ul className="bg-surface divide-y overflow-hidden rounded-[1.4rem] border-2">
          {sent.data.map((gift) => (
            <li key={gift.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar src={gift.recipient.image} name={gift.recipient.name} className="size-9" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium">{gift.recipient.name ?? "Fan"}</span>
                <span className="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {timeAgo(gift.createdAt)}
                  {gift.state === "waiting" &&
                    (gift.declined ? (
                      <Badge variant="destructive">Declined</Badge>
                    ) : (
                      <Badge variant="warning">Waiting to be accepted</Badge>
                    ))}
                  {gift.state === "takenBack" && <Badge>Taken back</Badge>}
                </span>
              </span>
              <span className="num text-right text-sm font-semibold">
                {gift.tokens
                  ? `${gift.tokens.amount.toLocaleString()} ${gift.tokens.code}`
                  : gift.copy
                    ? `${gift.copy.title} #${gift.copy.tokenId}`
                    : null}
              </span>
              {gift.state === "waiting" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={flow.busy}
                  onClick={() => flow.takeBack(gift)}
                >
                  {flow.busy && flow.current === gift.id && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Take back
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ClaimToast flow={flow} />
    </section>
  );
}

/** Taking back a gift nobody accepted: the tokens return to storage, the held 1 XLM to the wallet. */
function useGiftTakeBack() {
  const utils = api.useUtils();
  const prepare = api.gifts.prepareTakeBack.useMutation();
  const submit = api.gifts.submitTakeBack.useMutation();
  const flow = useClaimFlow({
    prepare: (orderId) => prepare.mutateAsync({ orderId }),
    submit: ({ id, xdr }) => submit.mutateAsync({ orderId: id, xdr }),
    preparing: "Preparing to take it back…",
    sending: "Taking the gift back. This takes a few seconds.",
    success: {
      title: "Gift taken back",
      body: "The tokens are back in your storage, and 1 XLM is back in your wallet.",
    },
    failed: "Couldn't take the gift back. Nothing was sent.",
    onDone: () =>
      Promise.all([
        utils.gifts.sent.invalidate(),
        utils.gifts.quote.invalidate(),
        utils.account.me.invalidate(),
        utils.wallet.assets.invalidate(),
        utils.admin.activity.list.invalidate(),
      ]),
  });
  return {
    ...flow,
    takeBack: (gift: SentGift) =>
      flow.run(
        gift.id,
        <>
          Take back {gift.tokens?.amount.toLocaleString()} {gift.tokens?.code} from{" "}
          {gift.recipient.name ?? "this fan"}. 1 XLM returns to your wallet; you pay the network
          fee.
        </>,
      ),
  };
}
