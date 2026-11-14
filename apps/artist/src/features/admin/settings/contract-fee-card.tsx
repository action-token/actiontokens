"use client";

import { Gem } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { stellarExpertTxUrl } from "@bandcoin/wallet/config";
import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { Field } from "@bandcoin/ui/patterns/form-page";

import { api } from "~/trpc/react";

import { messageOf } from "../murals/model";
import { SettingCard, SettingFact } from "./setting-card";

const MAX_PERCENT = 10;
const ACCOUNT = /^G[A-Z2-7]{55}$/;
const short = (account: string | null) => (account ? abbreviateAddress(account, 5) : "not set");

/**
 * The fee the shared NFT contract charges on every NFT sale. It lives on the
 * contract, whose owner is the platform treasury: an admin confirms, the
 * server signs as the treasury and the treasury pays the network fee.
 */
export function ContractFeeCard() {
  const current = api.admin.settings.contractFee.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const data = current.data;
  const onChain = data?.onChain;

  return (
    <SettingCard
      icon={Gem}
      title="Contract-NFT fee"
      description="What the NFT contract takes from every NFT sale. Changing it is a transaction the platform treasury signs and pays for."
    >
      <div className="grid gap-5">
        {current.isPending ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : !onChain ? (
          <p className="text-fg-muted text-sm">{data?.error ?? "Couldn't read the contract."}</p>
        ) : (
          <>
            <dl className="grid gap-2 sm:grid-cols-3">
              <SettingFact label="Now on the contract" value={`${onChain.feeBps / 100}%`} />
              <SettingFact label="Goes to" value={short(onChain.treasury)} />
              <SettingFact label="Owner" value={short(onChain.owner)} />
            </dl>
            {data.canChange ? (
              <ChangeFee
                key={`${onChain.feeBps}-${onChain.treasury}`}
                feeBps={onChain.feeBps}
                treasury={onChain.treasury ?? ""}
              />
            ) : (
              <p className="text-fg-muted text-sm">
                The contract&apos;s owner isn&apos;t the platform treasury, so it can&apos;t be
                changed from here.
              </p>
            )}
          </>
        )}
      </div>
    </SettingCard>
  );
}

function ChangeFee({ feeBps, treasury }: { feeBps: number; treasury: string }) {
  const utils = api.useUtils();
  const [percent, setPercent] = useState(String(feeBps / 100));
  const [account, setAccount] = useState(treasury);
  const [confirming, setConfirming] = useState(false);
  const bps = Math.round(Number(percent) * 100);
  const percentError =
    percent.trim() === "" || Number.isNaN(bps) || bps < 0 || bps > MAX_PERCENT * 100
      ? `0 to ${MAX_PERCENT}%`
      : null;
  const accountError = ACCOUNT.test(account.trim()) ? null : "A Stellar account starts with G";
  const input = { feeBps: bps, treasury: account.trim() };
  const changed = !percentError && !accountError && (bps !== feeBps || input.treasury !== treasury);

  const change = api.admin.settings.changeContractFee.useMutation({
    onSuccess: (result) => {
      setConfirming(false);
      toast.success(
        <span>
          The contract now charges {result.after.feeBps / 100}%.{" "}
          <a
            href={stellarExpertTxUrl(result.txHash)}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            View on Stellar
          </a>
        </span>,
      );
      void utils.admin.settings.contractFee.invalidate();
    },
    onError: (error) => {
      setConfirming(false);
      toast.error(messageOf(error));
    },
  });

  return (
    <div className="grid gap-4 border-t border-dashed pt-5">
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
      <Button
        className="justify-self-start"
        disabled={!changed || change.isPending}
        onClick={() => setConfirming(true)}
      >
        Change the fee
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !change.isPending && setConfirming(open)}
        title={`Change the NFT fee to ${bps / 100}%?`}
        description={
          <>
            Every NFT sale from now on pays {bps / 100}% (now {feeBps / 100}%) to{" "}
            <span className="font-mono">{short(input.treasury)}</span>. The platform treasury signs
            and pays the small network fee. You can change it again later.
          </>
        }
        confirmLabel="Change the fee"
        destructive={false}
        busy={change.isPending}
        onConfirm={() => change.mutate(input)}
      />
    </div>
  );
}
