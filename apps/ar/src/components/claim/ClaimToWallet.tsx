"use client";

import { CheckCircle2, Info, Loader2, Wallet } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { useRewardClaim } from "~/lib/ar/useRewardClaim";
import { api } from "~/trpc/react";

/**
 * "Claim to wallet" on a collected pin's card page. Collecting already
 * happened; this sends the reward (an item or the artist's fan token) to the
 * fan's Stellar wallet. The fan pays only the network fee, plus the trustline
 * reserve if they don't hold the token yet.
 */
export function ClaimToWallet({ pinId }: { pinId: string }) {
  const session = useSession();
  const state = api.claim.forPin.useQuery({ spotId: pinId }, { enabled: session.status === "authenticated" });
  const [open, setOpen] = useState(false);

  const overview = state.data;
  if (!overview) return null;

  if (overview.state === "none" || overview.state === "unsupported" || !overview.reward) {
    return (
      <Notice
        icon={overview.state === "unsupported" ? Info : CheckCircle2}
        title="Collected"
        body={overview.state === "unsupported" ? "This reward can't be claimed to a wallet yet." : "You collected this pin."}
      />
    );
  }
  if (overview.state === "delivered") {
    return <Notice icon={CheckCircle2} title="In your wallet" body={`${overview.reward.name} is yours on Stellar.`} />;
  }

  return (
    <>
      <ArButton variant="primary" size="lg" block icon={Wallet} onClick={() => setOpen(true)}>
        Claim to wallet
      </ArButton>
      <ClaimSheet open={open} onClose={() => setOpen(false)} claimId={overview.claimId} name={overview.reward.name} code={overview.reward.code} />
    </>
  );
}

function Notice({ icon: Icon, title, body }: { icon: typeof Info; title: string; body: string }) {
  return (
    <div className="ar-bevel rounded-ar flex items-center gap-3 p-3.5">
      <Icon size={20} className="text-ar-accent-hot shrink-0" strokeWidth={2.2} />
      <div className="min-w-0">
        <p className="font-hud text-ar-text text-[13px] font-bold">{title}</p>
        <p className="text-ar-dim truncate text-[12px]">{body}</p>
      </div>
    </div>
  );
}

function ClaimSheet({ open, onClose, claimId, name, code }: { open: boolean; onClose: () => void; claimId: string; name: string; code: string }) {
  const quote = api.claim.quote.useQuery({ claimId }, { enabled: open, staleTime: 20_000 });
  const flow = useRewardClaim(claimId);
  const q = quote.data;
  const finished = flow.step?.kind === "success";

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (flow.busy) return;
        flow.reset();
        onClose();
      }}
      labelledBy="claim-title"
      dismissible={!flow.busy}
    >
      <div className="px-6 pt-3 pb-5">
        <h2 id="claim-title" className="font-hud text-ar-text text-[19px] font-bold">
          Claim to wallet
        </h2>
        <p className="text-ar-dim mt-1 text-[12.5px] leading-relaxed">
          Send <b className="text-ar-text">1 {name}</b> to your Stellar wallet. You only pay Stellar&apos;s costs; Bandcoin
          charges nothing.
        </p>

        <div className="mt-4 min-h-24">
          {!q ? (
            <div className="text-ar-faint flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <>
              <ul className="ar-bevel divide-ar-line rounded-ar divide-y">
                {q.lines.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                    <span className="min-w-0">
                      <span className="text-ar-text block text-[12.5px]">{line.label}</span>
                      {line.hint && <span className="text-ar-faint block text-[11px]">{line.hint}</span>}
                    </span>
                    <span className="font-hud shrink-0 text-[12.5px] font-semibold tabular-nums">
                      {trimAmount(line.amount)} {line.currency}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="font-hud text-ar-text text-[12px] font-bold tracking-[0.1em] uppercase">Total</span>
                  <span className="font-hud text-ar-text text-[15px] font-bold tabular-nums">
                    {trimAmount(q.total)} {q.currency}
                  </span>
                </li>
              </ul>
              {q.source && (
                <p className="text-ar-faint mt-2 text-[11.5px]">
                  {q.source === "stock" ? "Sent from the artist's stock." : `A new ${code} is minted for you when you claim.`}
                </p>
              )}
              {q.problems.length > 0 && !finished && (
                <ul className="mt-3 space-y-1.5">
                  {q.problems.map((problem) => (
                    <li key={problem.code} className="rounded-ar bg-ar-danger/10 text-ar-danger px-3 py-2 text-[12px]">
                      {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {flow.step ? (
          <div className={cn("mt-4 [&>*]:w-full")}>
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
        ) : (
          <ArButton
            variant="primary"
            size="lg"
            block
            className="mt-4"
            disabled={!q?.ok}
            onClick={() => flow.claim(<>Claiming 1 {name}</>)}
          >
            {q ? `Claim for ${trimAmount(q.total)} XLM` : "Claim"}
          </ArButton>
        )}
      </div>
    </BottomSheet>
  );
}

/** "0.5000200" → "0.50002": stroop precision without the trailing zeros. */
const trimAmount = (amount: string) => amount.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
