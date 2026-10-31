"use client";

import { useState } from "react";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Field } from "@bandcoin/ui/patterns/form-page";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { PaymentToast } from "../../payments/payment-toast";
import { QuoteBreakdown } from "../../payments/quote-breakdown";
import { useWalletPayment } from "../../payments/use-wallet-payment";
import { SettingsSection } from "../../settings/settings-section";

const MAX_PERCENT = 10;
const ACCOUNT = /^G[A-Z2-7]{55}$/;

/**
 * The fee the shared NFT contract charges on every NFT sale. It lives on the
 * contract, so changing it is a transaction from the contract owner's wallet:
 * the network fee shows first, then the admin signs.
 */
export function ContractFeeCard() {
  const current = api.admin.settings.contractFee.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const me = api.account.me.useQuery();
  const onChain = current.data?.onChain;

  return (
    <SettingsSection
      title="Contract-NFT fee"
      description="What the NFT contract takes from every NFT sale. Only the contract's owner can change it, from their own wallet."
    >
      <div className="bg-surface border-border grid gap-4 rounded-xl border p-4 sm:p-5">
        {current.isPending ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : !onChain ? (
          <p className="text-fg-muted text-sm">
            {current.data?.error ?? "Couldn't read the contract."}
          </p>
        ) : (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <Fact label="Now on the contract" value={`${onChain.feeBps / 100}%`} />
              <Fact
                label="Goes to"
                value={onChain.treasury ? abbreviateAddress(onChain.treasury, 5) : "Not set"}
              />
              <Fact
                label="Owner"
                value={onChain.owner ? abbreviateAddress(onChain.owner, 5) : "Unknown"}
              />
            </dl>
            {onChain.owner && me.data?.walletAddress === onChain.owner ? (
              <ChangeFee
                key={`${onChain.feeBps}-${onChain.treasury}`}
                feeBps={onChain.feeBps}
                treasury={onChain.treasury ?? ""}
                balance={me.data.balances.XLM}
              />
            ) : (
              <p className="text-fg-muted text-sm">
                Sign in with the owner&apos;s wallet to change it.
              </p>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-faint text-xs">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  );
}

function ChangeFee({
  feeBps,
  treasury,
  balance,
}: {
  feeBps: number;
  treasury: string;
  balance?: string;
}) {
  const utils = api.useUtils();
  const [percent, setPercent] = useState(String(feeBps / 100));
  const [account, setAccount] = useState(treasury);
  const bps = Math.round(Number(percent) * 100);
  const percentError =
    percent.trim() === "" || Number.isNaN(bps) || bps < 0 || bps > MAX_PERCENT * 100
      ? `0 to ${MAX_PERCENT}%`
      : null;
  const accountError = ACCOUNT.test(account.trim()) ? null : "A Stellar account starts with G";
  const input = { feeBps: bps, treasury: account.trim() };
  const valid = !percentError && !accountError;
  const changed = valid && (bps !== feeBps || input.treasury !== treasury);

  const quote = api.admin.settings.contractFeeQuote.useQuery(input, {
    enabled: changed,
    refetchInterval: 30_000,
  });
  const start = api.admin.settings.contractFeeStart.useMutation();
  const submit = api.admin.settings.contractFeeSubmit.useMutation();
  const cancel = api.admin.settings.contractFeeCancel.useMutation();
  const flow = useWalletPayment({
    start: () => start.mutateAsync(input),
    submit: (step) => submit.mutateAsync(step),
    cancel: (step) => cancel.mutateAsync(step),
    preparing: "Preparing the fee change…",
    sending: "Changing the contract's fee. This takes a few seconds.",
    success: {
      title: "The contract's fee is changed",
      body: "Every NFT sale from now on pays the new fee.",
    },
    onDone: () => utils.admin.settings.contractFee.invalidate(),
  });
  const total = quote.data?.total;

  return (
    <div className="border-border grid gap-4 border-t pt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Field label="New fee (%)" htmlFor="contract-fee" error={percentError}>
          <Input
            id="contract-fee"
            inputMode="decimal"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        </Field>
        <Field label="Goes to" htmlFor="contract-treasury" error={account ? accountError : null}>
          <Input
            id="contract-treasury"
            value={account}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(event) => setAccount(event.target.value.toUpperCase())}
          />
        </Field>
      </div>
      {changed && <QuoteBreakdown quote={quote.data} balance={balance} loading={quote.isPending} />}
      <Button
        className="justify-self-start"
        disabled={!changed || !quote.data?.ok || flow.busy}
        onClick={() => void flow.run(total ? <Money amount={total} currency="XLM" /> : null)}
      >
        {flow.busy ? (
          "Working…"
        ) : total && changed ? (
          <>
            Pay <Money amount={total} currency="XLM" /> and change the fee
          </>
        ) : (
          "Change the fee"
        )}
      </Button>
      <PaymentToast flow={flow} />
    </div>
  );
}
