"use client";

import { Loader2, Wallet } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { site } from "@actiontokens/ar-core/site";
import { cn } from "@actiontokens/ui/lib/cn";
import { TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";

import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { useSquareCard } from "~/lib/ar/useSquareCard";
import { type SubscribeCurrency, useSubscribe } from "~/lib/ar/useSubscribe";
import { api } from "~/trpc/react";

const CURRENCIES: { id: SubscribeCurrency; label: string }[] = [
  { id: "BANDCOIN", label: "BANDCOIN" },
  { id: "XLM", label: "XLM" },
  { id: "USDC", label: "USDC" },
  { id: "USD", label: "Card" },
];

/**
 * Subscribe to an artist from the AR app: trust their fan token, the same
 * order as the fan app's Subscribe dialog, paid in BANDCOIN, XLM, USDC or by
 * card (plan 33). The fan sees the price first and nothing happens unless they
 * tap Subscribe. Short of funds, the button opens the fan app's Recharge page.
 */
export function SubscribeSheet({
  open,
  onClose,
  organizationId,
  artistName,
  code,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  artistName: string;
  code: string;
}) {
  const { status } = useSession();
  const [currency, setCurrency] = useState<SubscribeCurrency>("BANDCOIN");
  const byCard = currency === "USD";
  const quote = api.subscribe.quote.useQuery(
    { organizationId, currency },
    { enabled: open && status === "authenticated", staleTime: 20_000 },
  );
  const flow = useSubscribe(organizationId, code, currency);
  const { container: cardField, ...card } = useSquareCard(open && byCard);
  // Never show another currency's price while the new one loads.
  const q =
    quote.data?.kind === "TOKEN_TRUST" && quote.data.currency === currency ? quote.data : null;
  const finished = flow.step?.kind === "success";
  const short = q?.problems.some((problem) => problem.code === "INSUFFICIENT_FUNDS") ?? false;

  async function subscribe() {
    if (!q) return;
    const token = byCard ? await card.tokenize() : undefined;
    if (byCard && !token) return;
    flow.claim(
      <>
        {formatAmount(q.total, q.currency)} to subscribe with {code}
      </>,
      token ?? undefined,
    );
  }

  function close() {
    if (flow.busy) return;
    flow.reset();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} labelledBy="subscribe-title" dismissible={!flow.busy}>
      <div className="px-6 pt-3 pb-5">
        <h2 id="subscribe-title" className="font-hud text-ar-text text-[19px] font-bold">
          Subscribe to {artistName}
        </h2>
        <p className="text-ar-dim mt-1 text-[12.5px] leading-relaxed">
          Subscribers trust <b className="text-ar-text">{code}</b>, {artistName}&apos;s fan token,
          and can collect their subscriber pins and open their subscriber posts and stories. It
          locks 0.5 XLM in your wallet, which you get back if you remove the line.
        </p>

        <SegmentedTabs
          tabs={CURRENCIES}
          value={currency}
          onChange={(id) => !flow.busy && setCurrency(id)}
          layoutId="subscribe-currency"
          className="mt-4"
        />

        <div className="mt-3 min-h-24">
          {quote.error ? (
            <p className="rounded-ar bg-ar-danger/10 text-ar-danger px-3 py-2 text-[12px]">
              {quote.error.message}
            </p>
          ) : !q ? (
            <div className="text-ar-faint flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* No price (e.g. the rate couldn't be read): only the problem is shown. */}
              {q.lines.length > 0 && (
                <ul className="ar-bevel divide-ar-line rounded-ar divide-y">
                  {q.lines
                    .filter((line) => line.key !== "total")
                    .map((line) => (
                      <li
                        key={line.key}
                        className="flex items-start justify-between gap-3 px-3.5 py-2.5"
                      >
                        <span className="text-ar-text min-w-0 text-[12.5px]">{line.label}</span>
                        <span className="font-hud shrink-0 text-[12.5px] font-semibold tabular-nums">
                          {formatAmount(line.amount, line.currency)}
                        </span>
                      </li>
                    ))}
                  <li className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="font-hud text-ar-text text-[12px] font-bold tracking-[0.1em] uppercase">
                      You pay
                    </span>
                    <span className="font-hud text-ar-text text-[15px] font-bold tabular-nums">
                      {formatAmount(q.total, q.currency)}
                    </span>
                  </li>
                </ul>
              )}
              {q.problems.length > 0 && !finished && (
                <ul className="mt-3 space-y-1.5">
                  {q.problems.map((problem) => (
                    <li
                      key={problem.code + problem.message}
                      className="rounded-ar bg-ar-danger/10 text-ar-danger px-3 py-2 text-[12px]"
                    >
                      {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {byCard && !finished && (
            <div className="mt-3 grid gap-1.5">
              <div
                ref={cardField}
                className={cn(
                  "min-h-[90px]",
                  card.loading && "rounded-ar animate-pulse bg-white/[0.05]",
                )}
              />
              {card.error && <p className="text-ar-danger text-[12px]">{card.error}</p>}
            </div>
          )}
        </div>

        {flow.step ? (
          <div className="mt-4 [&>*]:w-full">
            <TransactionToast
              key={flow.step.kind}
              step={flow.step}
              onSend={flow.send}
              onCancel={flow.stop}
              actions={
                flow.step.kind === "confirm" ? (
                  <ArButton variant="ghost" size="sm" onClick={flow.stop}>
                    Cancel
                  </ArButton>
                ) : (
                  <ArButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      flow.reset();
                      if (finished) onClose();
                    }}
                  >
                    {finished ? "Done" : "Close"}
                  </ArButton>
                )
              }
            />
          </div>
        ) : short ? (
          <ArLinkButton
            href={`${site.urls.fanApp}/recharge`}
            variant="primary"
            size="lg"
            block
            icon={Wallet}
            className="mt-4"
          >
            {currency === "BANDCOIN" ? "Add BANDCOIN" : "Add funds"}
          </ArLinkButton>
        ) : (
          <div className="mt-4 flex gap-2">
            <ArButton variant="ghost" size="lg" onClick={close}>
              Not now
            </ArButton>
            <ArButton
              variant="primary"
              size="lg"
              block
              disabled={!q?.ok || quote.isFetching || (byCard && !card.ready)}
              onClick={() => void subscribe()}
            >
              Subscribe
            </ArButton>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** "0.5000200" → "0.50002": stroop precision without the trailing zeros. */
const trimAmount = (amount: string) => amount.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

/** "1.0000000" USD → "$1.00"; anything else keeps stroop precision and its code. */
const formatAmount = (amount: string, currency: string) =>
  currency === "USD" ? `$${Number(amount).toFixed(2)}` : `${trimAmount(amount)} ${currency}`;
