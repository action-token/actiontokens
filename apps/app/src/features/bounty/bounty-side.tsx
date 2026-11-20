"use client";

import {
  ArrowRight,
  CheckCircle2,
  Crown,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Trophy,
  Users,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { nameOf, PersonAvatar } from "./bounty-people";
import { useClaim } from "./use-claim";

type Bounty = RouterOutputs["bounty"]["byId"];
export type BountyTab = "description" | "participants" | "reports";

const ORG_URL = process.env.NEXT_PUBLIC_ORG_URL ?? "https://org.action-tokens.com";

/** Which tab the page shows lives in the URL, so the page and the side panel agree. */
export function useBountyTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as BountyTab | null) ?? "description";
  const setTab = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next === "description") query.delete("tab");
    else query.set("tab", next);
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  return { tab, setTab };
}

/** A joined fan can report on a running bounty, unless it's a listening challenge. */
export const canSubmitReport = (bounty: Bounty) =>
  bounty.joined &&
  bounty.status === "RUNNING" &&
  !bounty.isCreator &&
  bounty.music?.mode !== "MUSIC_ONLY";

/** The prize, the one action that fits, stats and winners. */
export function BountySide({ bounty }: { bounty: Bounty }) {
  const { setTab } = useBountyTab();
  return (
    <div className="grid content-start gap-4">
      <RewardsCard bounty={bounty} />
      <BountyAction
        bounty={bounty}
        canSubmit={canSubmitReport(bounty)}
        onSubmitReport={() => setTab("reports")}
      />
      <StatsCard bounty={bounty} />
      {bounty.winnerList.length > 0 && <WinnersCard bounty={bounty} />}
    </div>
  );
}

/** Join, Submit report, Claim, or why none of those applies right now. */
function BountyAction({
  bounty,
  canSubmit,
  onSubmitReport,
}: {
  bounty: Bounty;
  canSubmit: boolean;
  onSubmitReport?: () => void;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const utils = api.useUtils();
  const claim = useClaim(bounty.id);
  const join = api.bounty.join.useMutation({
    onSuccess: async () => {
      toast.success("Joined!");
      await Promise.all([
        utils.bounty.byId.invalidate({ bountyId: bounty.id }),
        utils.bounty.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const winner = bounty.me?.winner;
  const prize = (
    <Money
      amount={winner?.prize ?? "0"}
      currency={bounty.prize.currency}
      code={bounty.prize.code}
    />
  );

  let action: ReactNode = null;
  if (bounty.isCreator) {
    action = (
      <Button asChild size="lg" className="w-full">
        <a href={`${ORG_URL}/bounties/${bounty.id}`}>
          Manage in artist portal <ExternalLink className="size-4" />
        </a>
      </Button>
    );
  } else if (winner && !winner.claimed) {
    action = (
      <Button
        size="lg"
        className="w-full font-bold"
        disabled={claim.busy}
        onClick={() => claim.claim(<>Claim {prize} from the bounty escrow.</>)}
      >
        {claim.busy ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
        Claim {prize}
      </Button>
    );
  } else if (winner?.claimed) {
    action = (
      <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold">
        <CheckCircle2 className="text-primary-text size-4" /> Reward claimed
      </p>
    );
  } else if (status !== "authenticated") {
    if (bounty.status === "RUNNING")
      action = (
        <Button size="lg" className="w-full" onClick={() => openSignIn(true)}>
          <Users className="size-4" /> Join bounty
        </Button>
      );
  } else if (bounty.status === "PAUSED" && bounty.joined) {
    action = (
      <p className="text-fg-muted flex items-start gap-2.5 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0" /> Submissions are paused.
      </p>
    );
  } else if (!bounty.joined && bounty.status === "RUNNING") {
    action = (
      <Button
        size="lg"
        className="w-full"
        disabled={join.isPending}
        onClick={() => join.mutate({ bountyId: bounty.id })}
      >
        {join.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Users className="size-4" />
        )}
        Join bounty
      </Button>
    );
  } else if (canSubmit) {
    action = (
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          onSubmitReport?.();
          requestAnimationFrame(() =>
            document.getElementById("reports")?.scrollIntoView({ behavior: "smooth" }),
          );
        }}
      >
        <FileText className="size-4" /> Submit report <ArrowRight className="ml-auto size-4" />
      </Button>
    );
  } else if (bounty.status === "COMPLETED" && !bounty.joined) {
    action = <p className="text-fg-muted py-1 text-center text-xs">This bounty has ended</p>;
  }

  return (
    <>
      {action && <div className="pt-1">{action}</div>}
      {claim.step && (
        <ToastViewport>
          <TransactionToast
            key={claim.step.kind}
            step={claim.step}
            onSend={claim.send}
            onCancel={claim.stop}
            actions={
              <Button
                size="sm"
                variant={claim.step.kind === "confirm" ? "secondary" : "ghost"}
                className="h-8 px-3 text-[13px]"
                onClick={claim.step.kind === "confirm" ? claim.stop : claim.close}
              >
                {claim.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </>
  );
}

function RewardsCard({ bounty }: { bounty: Bounty }) {
  const perWinner = Number(bounty.prize.amount) / Math.max(1, bounty.maxWinners);
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <p className="label-caps text-fg-faint flex items-center gap-1.5">
          <Trophy className="text-primary-text size-3.5" /> Prize pool
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Money
            amount={bounty.prize.amount}
            currency={bounty.prize.currency}
            code={bounty.prize.code}
            className="display text-4xl"
          />
          <a
            href={bounty.prize.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`View ${bounty.prize.currency} on Stellar Expert`}
            className="text-fg-muted hover:text-fg inline-flex items-center gap-0.5 text-xs font-semibold"
          >
            {bounty.prize.currency} <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
      {bounty.maxWinners > 1 && (
        <p className="flex justify-between border-t pt-2 text-xs">
          <span className="text-fg-muted">Per winner</span>
          <Money
            amount={perWinner}
            currency={bounty.prize.currency}
            code={bounty.prize.code}
            className="font-semibold"
          />
        </p>
      )}
    </section>
  );
}

function StatsCard({ bounty }: { bounty: Bounty }) {
  const rows = [
    { icon: Users, label: "Participants", value: bounty.participants.toLocaleString() },
    { icon: FileText, label: "Submissions", value: bounty.submissions.toLocaleString() },
    { icon: Crown, label: "Winners", value: `${bounty.winners} / ${bounty.maxWinners}` },
  ];
  return (
    <section className="grid gap-1 border-t pt-4">
      <p className="label-caps text-fg-faint pb-1">Stats</p>
      {rows.map(({ icon: Icon, label, value }) => (
        <p
          key={label}
          className="flex items-center justify-between border-b py-1.5 text-xs last:border-0"
        >
          <span className="text-fg-muted flex items-center gap-2">
            <Icon className="size-3.5" /> {label}
          </span>
          <b className="font-bold">{value}</b>
        </p>
      ))}
    </section>
  );
}

function WinnersCard({ bounty }: { bounty: Bounty }) {
  return (
    <section className="grid gap-3 border-t pt-4">
      <h2 className="display flex items-center gap-2 text-lg">
        <Crown className="text-primary-text size-4" /> Winners
        <span className="text-fg-muted text-xs font-normal">
          ({bounty.winnerList.length}/{bounty.maxWinners})
        </span>
      </h2>
      {bounty.winnerList.map((winner, index) => (
        <div key={index} className="flex items-center gap-2.5">
          <span className="marker text-fg-faint w-6 shrink-0 text-base">#{index + 1}</span>
          <PersonAvatar person={winner.user} className="size-8" />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-xs font-semibold">{nameOf(winner.user)}</b>
            <Money
              amount={winner.prize}
              currency={bounty.prize.currency}
              code={bounty.prize.code}
              className="text-fg-muted text-[11px]"
            />
          </span>
          {winner.claimed && (
            <CheckCircle2 aria-label="Claimed" className="text-primary-text size-4 shrink-0" />
          )}
        </div>
      ))}
    </section>
  );
}
