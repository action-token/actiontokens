"use client";

import { useRef } from "react";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** The platform signing for the storage account looks the same to the artist as a custodial wallet: a countdown with Cancel, then it goes. */
const signerFor = (signer: "server" | "custodial" | "wallet") =>
  signer === "wallet" ? ("wallet" as const) : ("custodial" as const);

/**
 * Funding a bounty's prize into escrow (see useWalletPayment for how the payment
 * moves). Cancelling or failing leaves the draft saved; it shows in the list as
 * "Not funded" with a way to finish or discard it.
 */
export function useBountyFunding(onFunded: (bountyId: string) => void) {
  const utils = api.useUtils();
  const prepare = api.bounties.prepareFunding.useMutation();
  const submit = api.bounties.submitFunding.useMutation();
  const target = useRef("");

  const flow = useWalletPayment({
    start: async () => {
      const prepared = await prepare.mutateAsync({ bountyId: target.current });
      return { orderId: target.current, xdr: prepared.xdr, signer: signerFor(prepared.signer) };
    },
    submit: ({ orderId, xdr }) => submit.mutateAsync({ bountyId: orderId, xdr }),
    cancel: () => Promise.resolve(),
    preparing: "Preparing your bounty…",
    sending: "Moving the prize into escrow. This takes a few seconds.",
    success: {
      title: "Your bounty is live",
      body: "The prize is held in escrow until you pick winners.",
    },
    onDone: async () => {
      await Promise.all([utils.bounties.list.invalidate(), utils.bounties.get.invalidate()]);
      onFunded(target.current);
    },
  });

  return {
    ...flow,
    fund: (bountyId: string, summary: React.ReactNode) => {
      target.current = bountyId;
      return flow.run(summary);
    },
  };
}

/** Committing part of the escrow to a winner (`select_winner`), then recording them. */
export function useWinnerPick(bountyId: string) {
  const utils = api.useUtils();
  const prepare = api.bounties.prepareWinner.useMutation();
  const submit = api.bounties.submitWinner.useMutation();
  const pick = useRef({ winnerUserId: "", amount: "" });

  const flow = useWalletPayment({
    start: async () => {
      const prepared = await prepare.mutateAsync({ bountyId, ...pick.current });
      return { orderId: bountyId, xdr: prepared.xdr, signer: signerFor(prepared.signer) };
    },
    submit: ({ xdr }) => submit.mutateAsync({ bountyId, ...pick.current, xdr }),
    cancel: () => Promise.resolve(),
    preparing: "Preparing the prize…",
    sending: "Committing the prize to the winner. This takes a few seconds.",
    success: { title: "Winner picked", body: "They can claim their prize now." },
    onDone: () =>
      Promise.all([
        utils.bounties.get.invalidate({ bountyId }),
        utils.bounties.participants.invalidate({ bountyId }),
      ]),
  });

  return {
    ...flow,
    pickWinner: (winnerUserId: string, amount: string, summary: React.ReactNode) => {
      pick.current = { winnerUserId, amount };
      return flow.run(summary);
    },
  };
}
