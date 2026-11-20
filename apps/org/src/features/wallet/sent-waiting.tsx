"use client";

import { Loader2, Undo2 } from "lucide-react";

import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import { WalletPanel } from "@actiontokens/ui/patterns/wallet-blocks";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { ClaimToast, useClaimFlow } from "./use-claim-flow";

type WaitingSend = RouterOutputs["wallet"]["sentWaiting"][number];

const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });

/**
 * Sent, waiting: tokens you sent to someone who couldn't hold them yet and
 * hasn't accepted. Until they do, you can take each one back. Shows nothing
 * when nothing is waiting.
 */
export function SentWaiting() {
  const sent = api.wallet.sentWaiting.useQuery();
  const flow = useTakeBack();
  const count = sent.data?.length ?? 0;
  if (count === 0 && !flow.step) return null;

  return (
    <WalletPanel
      title={
        <>
          Sent, waiting
          {count > 0 && (
            <span className="bg-surface-3 text-fg-muted rounded-full px-2 font-sans text-sm font-bold tabular-nums">
              {count}
            </span>
          )}
        </>
      }
    >
      {count === 0 ? (
        <p className="text-fg-muted py-2 text-sm">Nothing is waiting to be accepted.</p>
      ) : (
        <ul className="space-y-2">
          {sent.data!.map((send) => (
            <li
              key={send.balanceId}
              className="bg-surface-2 flex items-center gap-3 rounded-xl p-3"
            >
              <span className="blob bg-surface-3 text-fg-muted flex size-10 shrink-0 -rotate-6 items-center justify-center">
                <Undo2 className="size-5" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold">
                  <span>
                    <span className="num">{tokens(send.amount)}</span> {send.code}
                  </span>
                  {send.declined && <Badge variant="destructive">Declined</Badge>}
                </p>
                <p className="text-fg-muted truncate text-xs">
                  To {receiverOf(send)} · {send.declined ? "they declined it" : "not accepted yet"}{" "}
                  · taking back costs <Money amount={send.cost.total} currency="XLM" />
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={flow.busy}
                onClick={() => flow.takeBack(send)}
              >
                {flow.busy && flow.current === send.balanceId && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Take back
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ClaimToast flow={flow} />
    </WalletPanel>
  );
}

/** The Bandcoin user, or the start and end of the address. */
function receiverOf(send: WaitingSend) {
  if (send.to.username) return `@${send.to.username}`;
  return send.to.address
    ? `${send.to.address.slice(0, 5)}…${send.to.address.slice(-5)}`
    : "someone";
}

function useTakeBack() {
  const utils = api.useUtils();
  const prepare = api.wallet.prepareTakeBack.useMutation();
  const submit = api.wallet.submitTakeBack.useMutation();
  const flow = useClaimFlow({
    prepare: (balanceId) => prepare.mutateAsync({ balanceId }),
    submit: ({ id, xdr }) => submit.mutateAsync({ balanceId: id, xdr }),
    preparing: "Preparing to take it back…",
    sending: "Taking it back. This takes a few seconds.",
    success: { title: "Taken back", body: "It's in your wallet again." },
    failed: "Couldn't take it back. Nothing was sent.",
    onDone: () =>
      Promise.all([
        utils.wallet.sentWaiting.invalidate(),
        utils.wallet.assets.invalidate(),
        utils.wallet.history.invalidate(),
        utils.account.me.invalidate(),
      ]),
  });
  return {
    ...flow,
    takeBack: (send: WaitingSend) =>
      flow.run(
        send.balanceId,
        <>
          Take back {tokens(send.amount)} {send.code} from {receiverOf(send)}. You pay{" "}
          <Money amount={send.cost.total} currency="XLM" />.
        </>,
      ),
  };
}
