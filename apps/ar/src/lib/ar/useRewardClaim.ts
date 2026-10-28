"use client";

import { api } from "~/trpc/react";

import { useSignedTransaction } from "./useSignedTransaction";

/** Claiming a pin's reward to the wallet. */
export function useRewardClaim(claimId: string) {
  const utils = api.useUtils();
  const prepare = api.claim.prepare.useMutation();
  const submit = api.claim.submit.useMutation();
  return useSignedTransaction({
    prepare: () => prepare.mutateAsync({ claimId }),
    submit: (xdr) => submit.mutateAsync({ claimId, xdr }),
    sending: "Sending the reward to your wallet. This takes a few seconds.",
    success: { title: "Reward claimed", body: "It's in your Stellar wallet now." },
    failure: "Couldn't claim the reward. Nothing was sent.",
    onDone: () => Promise.all([utils.claim.forPin.invalidate(), utils.claim.quote.invalidate({ claimId }), utils.account.me.invalidate()]),
  });
}

/** Claiming a bounty prize from the escrow. */
export function useBountyClaim(bountyId: string) {
  const utils = api.useUtils();
  const prepare = api.bounty.claimPrepare.useMutation();
  const submit = api.bounty.claimSubmit.useMutation();
  return useSignedTransaction({
    prepare: () => prepare.mutateAsync({ bountyId }),
    submit: (xdr) => submit.mutateAsync({ bountyId, xdr }),
    sending: "Sending your prize to your wallet. This takes a few seconds.",
    success: { title: "Prize claimed", body: "It's in your wallet now." },
    failure: "Couldn't claim the prize. Nothing was sent.",
    onDone: () => Promise.all([utils.bounty.byId.invalidate({ bountyId }), utils.account.me.invalidate()]),
  });
}
