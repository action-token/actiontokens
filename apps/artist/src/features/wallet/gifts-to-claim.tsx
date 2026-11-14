"use client";

import { Gift, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { WalletPanel } from "@bandcoin/ui/patterns/wallet-blocks";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { ClaimToast, useClaimFlow } from "./use-claim-flow";

type WaitingGift = RouterOutputs["wallet"]["gifts"][number];

const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });

/**
 * Pending gifts: tokens waiting for the fan to accept, from an artist (their
 * fan token, sent before the fan held it) or from anyone who sent a token the
 * fan couldn't hold yet. Each shows what accepting costs first; accepting
 * moves through the usual toast: countdown with Cancel for email/Google/Apple
 * accounts, "Confirm in your wallet" for wallet extensions.
 *
 * Decline costs nothing and signs nothing: the gift moves to "Declined" (the
 * sender sees that and can take it back). It can be put back or accepted for
 * as long as it's still waiting.
 */
export function GiftsToClaim() {
  const gifts = api.wallet.gifts.useQuery();
  const flow = useGiftClaim();
  const decline = useDecline();
  const waiting = gifts.data?.filter((gift) => !gift.declined) ?? [];
  const declined = gifts.data?.filter((gift) => gift.declined) ?? [];
  const count = waiting.length;

  return (
    <WalletPanel
      title={
        <>
          Pending gifts
          {count > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 font-sans text-sm font-bold tabular-nums">
              {count}
            </span>
          )}
        </>
      }
    >
      {gifts.isPending ? (
        <Skeleton className="h-14 rounded-xl" />
      ) : count === 0 ? (
        <p className="text-fg-muted flex items-center gap-2 py-2 text-sm">
          <Gift className="size-4" /> No gifts waiting. Tokens sent to you show up here to accept.
        </p>
      ) : (
        <ul className="space-y-2">
          {waiting.map((gift) => (
            <GiftRow key={gift.balanceId} gift={gift}>
              <Button
                size="sm"
                variant="ghost"
                disabled={flow.busy || decline.busy}
                onClick={() => decline.decline(gift.balanceId)}
              >
                Decline
              </Button>
              <AcceptButton gift={gift} flow={flow} disabled={decline.busy} />
            </GiftRow>
          ))}
        </ul>
      )}
      {declined.length > 0 && (
        <div className="grid gap-2">
          <span className="eyebrow">Declined</span>
          <ul className="space-y-2">
            {declined.map((gift) => (
              <GiftRow key={gift.balanceId} gift={gift} muted>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={flow.busy || decline.busy}
                  onClick={() => decline.putBack(gift.balanceId)}
                >
                  Put back
                </Button>
                <AcceptButton gift={gift} flow={flow} disabled={decline.busy} />
              </GiftRow>
            ))}
          </ul>
        </div>
      )}
      {decline.error && (
        <p role="alert" className="text-danger text-xs">
          {decline.error}
        </p>
      )}
      <ClaimToast flow={flow} />
    </WalletPanel>
  );
}

function GiftRow({
  gift,
  muted,
  children,
}: {
  gift: WaitingGift;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="bg-surface-2 flex flex-wrap items-center gap-3 rounded-xl p-3">
      <span
        className={cn(
          "blob flex size-10 shrink-0 -rotate-6 items-center justify-center",
          muted ? "bg-surface-3 text-fg-muted" : "bg-primary text-primary-foreground",
        )}
      >
        <Gift className="size-5" strokeWidth={2.4} />
      </span>
      <div className={cn("min-w-0 flex-1", muted && "text-fg-muted")}>
        <p className="truncate text-sm font-semibold">
          <span className="num">{tokens(gift.amount)}</span> {gift.code}
          {gift.title !== gift.code && (
            <span className="text-fg-muted font-normal"> · {gift.title}</span>
          )}
        </p>
        <p className="text-fg-muted truncate text-xs">
          From {senderOf(gift)} · accepting costs <Money amount={gift.cost.total} currency="XLM" />
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </li>
  );
}

function AcceptButton({
  gift,
  flow,
  disabled,
}: {
  gift: WaitingGift;
  flow: ReturnType<typeof useGiftClaim>;
  disabled: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={gift.declined ? "secondary" : "default"}
      disabled={flow.busy || disabled}
      onClick={() => flow.claim(gift)}
    >
      {flow.busy && flow.current === gift.balanceId && <Loader2 className="size-4 animate-spin" />}
      Accept
    </Button>
  );
}

/** The artist, the Bandcoin user, or the start and end of the address. */
function senderOf(gift: WaitingGift) {
  if (gift.artist) return gift.artist.name;
  if (gift.from.username) return `@${gift.from.username}`;
  return gift.from.address
    ? `${gift.from.address.slice(0, 5)}…${gift.from.address.slice(-5)}`
    : "someone";
}

function useGiftClaim() {
  const utils = api.useUtils();
  const prepare = api.wallet.prepareGiftClaim.useMutation();
  const submit = api.wallet.submitGiftClaim.useMutation();
  const flow = useClaimFlow({
    prepare: (balanceId) => prepare.mutateAsync({ balanceId }),
    submit: ({ id, xdr }) => submit.mutateAsync({ balanceId: id, xdr }),
    preparing: "Preparing your claim…",
    sending: "Claiming your gift. This takes a few seconds.",
    success: { title: "Gift accepted", body: "It's in your wallet now." },
    failed: "Couldn't claim the gift. Nothing was sent.",
    onDone: () =>
      Promise.all([
        utils.wallet.gifts.invalidate(),
        utils.wallet.assets.invalidate(),
        utils.account.me.invalidate(),
      ]),
  });
  return {
    ...flow,
    claim: (gift: WaitingGift) =>
      flow.run(
        gift.balanceId,
        <>
          Claim {tokens(gift.amount)} {gift.code}. You pay{" "}
          <Money amount={gift.cost.total} currency="XLM" />.
        </>,
      ),
  };
}

/** Decline and its undo: no signature, the row just moves. */
function useDecline() {
  const utils = api.useUtils();
  const options = {
    onSuccess: () => utils.wallet.gifts.invalidate(),
  };
  const decline = api.wallet.declineGift.useMutation(options);
  const putBack = api.wallet.undoDecline.useMutation(options);
  const failure = decline.error ?? putBack.error;
  return {
    busy: decline.isPending || putBack.isPending,
    error: failure?.message ?? null,
    decline: (balanceId: string) => {
      putBack.reset();
      decline.mutate({ balanceId });
    },
    putBack: (balanceId: string) => {
      decline.reset();
      putBack.mutate({ balanceId });
    },
  };
}
