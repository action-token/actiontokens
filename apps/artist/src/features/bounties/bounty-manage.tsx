"use client";

import { ExternalLink, Loader2, Pencil, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { Markdown } from "@bandcoin/ui/patterns/markdown";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { PaymentToast } from "../payments/payment-toast";
import { statusLabel, statusTone } from "./bounties-view";
import { useBountyFunding, useWinnerPick } from "./use-bounty-payments";

type Bounty = RouterOutputs["bounties"]["get"];
type Currency = "BANDCOIN" | "XLM" | "USDC";
type Person = Bounty["winners"][number]["user"];

const nameOf = (user: Pick<Person, "displayName" | "username">) =>
  user.displayName ?? user.username ?? "A fan";

/** Everything about one bounty: its state, reports, participants and winners. */
export function BountyManage({ bountyId }: { bountyId: string }) {
  const bounty = api.bounties.get.useQuery({ bountyId });
  if (bounty.isPending)
    return (
      <PageBody className="grid gap-6">
        <PageHeader back={{ href: "/bounties", label: "Bounties" }} eyebrow="Fans" title="Bounty" />
        <Skeleton className="h-80 w-full max-w-3xl rounded-xl" />
      </PageBody>
    );
  if (bounty.isError)
    return (
      <PageBody className="grid gap-6">
        <PageHeader back={{ href: "/bounties", label: "Bounties" }} eyebrow="Fans" title="Bounty" />
        <ErrorState message={bounty.error.message} onRetry={() => void bounty.refetch()} />
      </PageBody>
    );
  return <Loaded bounty={bounty.data} />;
}

function Loaded({ bounty }: { bounty: Bounty }) {
  const router = useRouter();
  const utils = api.useUtils();
  const currency = bounty.prizeCurrency as Currency;
  const [discarding, setDiscarding] = useState(false);

  const funding = useBountyFunding(() => undefined);
  const setStatus = api.bounties.setStatus.useMutation({
    onSuccess: () => void utils.bounties.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const discard = api.bounties.discard.useMutation({
    onSuccess: () => {
      toast.success("Draft deleted");
      void utils.bounties.list.invalidate();
      router.push("/bounties");
    },
    onError: (error) => {
      setDiscarding(false);
      toast.error(error.message);
    },
  });

  const left = Number(bounty.prizeAmount) - Number(bounty.awarded);
  const full = bounty.winners.length >= bounty.maxWinners;

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={{ href: "/bounties", label: "Bounties" }}
        eyebrow="Fans"
        title={bounty.title}
        description={bounty.summary || undefined}
        actions={
          <>
            <StatusPill tone={statusTone(bounty)}>{statusLabel(bounty)}</StatusPill>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/bounties/${bounty.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            {bounty.funded && bounty.status === "RUNNING" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ bountyId: bounty.id, status: "PAUSED" })}
              >
                Pause
              </Button>
            )}
            {bounty.funded && bounty.status === "PAUSED" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ bountyId: bounty.id, status: "RUNNING" })}
              >
                Resume
              </Button>
            )}
            {bounty.funded && bounty.status !== "COMPLETED" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ bountyId: bounty.id, status: "COMPLETED" })}
              >
                Mark completed
              </Button>
            )}
          </>
        }
      />

      {!bounty.funded && (
        <section role="note" className="bg-surface grid max-w-3xl gap-3 rounded-xl border p-5">
          <h2 className="display text-lg">This bounty isn&apos;t funded yet</h2>
          <p className="text-fg-muted text-sm">
            Fans can&apos;t see it until its prize of{" "}
            <Money amount={bounty.prizeAmount} currency={currency} /> is in escrow. You pay the
            prize and the network fee.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={funding.busy}
              onClick={() =>
                void funding
                  .fund(bounty.id, <Money amount={bounty.prizeAmount} currency={currency} />)
                  .then(() => utils.bounties.get.invalidate({ bountyId: bounty.id }))
              }
            >
              {funding.busy && <Loader2 className="animate-spin" />} Fund it now
            </Button>
            <Button variant="ghost" onClick={() => setDiscarding(true)}>
              Delete the draft
            </Button>
          </div>
        </section>
      )}

      <dl className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prize">
          <Money amount={bounty.prizeAmount} currency={currency} />
        </Stat>
        <Stat label="Still to award">
          <Money amount={String(Math.max(left, 0))} currency={currency} />
        </Stat>
        <Stat label="Joined">{bounty.participants}</Stat>
        <Stat label="Winners">
          {bounty.winners.length} / {bounty.maxWinners}
        </Stat>
      </dl>

      {bounty.funded && (
        <Tabs defaultValue="reports" className="max-w-3xl">
          <TabsList>
            <TabsTrigger value="reports">Reports ({bounty.submissions})</TabsTrigger>
            <TabsTrigger value="people">Participants ({bounty.participants})</TabsTrigger>
            <TabsTrigger value="winners">Winners ({bounty.winners.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="reports">
            <Reports bounty={bounty} canPick={!full && left > 0} />
          </TabsContent>
          <TabsContent value="people">
            <Participants bounty={bounty} canPick={!full && left > 0} />
          </TabsContent>
          <TabsContent value="winners">
            <Winners bounty={bounty} />
          </TabsContent>
        </Tabs>
      )}

      <section className="max-w-3xl">
        <h2 className="display mb-2 text-xl">Description</h2>
        <Markdown content={bounty.description || "_No description._"} />
      </section>

      <PaymentToast flow={funding} />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Delete this draft?"
        description="It was never funded, so nothing is held in escrow. This can't be undone."
        confirmLabel={discard.isPending ? "Deleting…" : "Delete"}
        busy={discard.isPending}
        onConfirm={() => discard.mutate({ bountyId: bounty.id })}
      />
    </PageBody>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl border p-3">
      <dt className="text-fg-muted text-xs">{label}</dt>
      <dd className="display text-lg">{children}</dd>
    </div>
  );
}

/** Pick someone as a winner: choose their share of the prize, then confirm. The prize moves on the escrow contract. */
function PickWinner({ bounty, userId, name }: { bounty: Bounty; userId: string; name: string }) {
  const currency = bounty.prizeCurrency as Currency;
  const left = Math.max(Number(bounty.prizeAmount) - Number(bounty.awarded), 0);
  const slots = Math.max(bounty.maxWinners - bounty.winners.length, 1);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => String(Math.floor((left / slots) * 1e7) / 1e7));
  const pick = useWinnerPick(bounty.id);
  const alreadyWon = bounty.winners.some((winner) => winner.user.id === userId);

  if (alreadyWon) return <StatusPill tone="success">Winner</StatusPill>;
  if (!open)
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Trophy /> Pick as winner
      </Button>
    );
  return (
    <div className="bg-surface-2 grid gap-2 rounded-lg p-3">
      <label className="grid gap-1 text-xs">
        <span className="text-fg-muted">
          {name}&apos;s prize ({currency}), up to{" "}
          <Money amount={String(left)} currency={currency} />
        </span>
        <Input
          inputMode="decimal"
          value={amount}
          aria-label={`Prize for ${name}`}
          onChange={(event) => setAmount(event.target.value.trim())}
          className="max-w-40"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pick.busy || Number(amount) <= 0}
          onClick={() =>
            void pick.pickWinner(userId, amount, <Money amount={amount} currency={currency} />)
          }
        >
          {pick.busy && <Loader2 className="animate-spin" />} Pick {name}
        </Button>
        <Button size="sm" variant="ghost" disabled={pick.busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <PaymentToast flow={pick} />
    </div>
  );
}

function Reports({ bounty, canPick }: { bounty: Bounty; canPick: boolean }) {
  const submissions = api.bounties.submissions.useQuery({ bountyId: bounty.id });
  if (submissions.isPending) return <Skeleton className="mt-3 h-32 w-full rounded-xl" />;
  if (submissions.isError)
    return (
      <ErrorState message="Couldn't load the reports." onRetry={() => void submissions.refetch()} />
    );
  if (submissions.data.length === 0)
    return <p className="text-fg-muted py-6 text-sm">No reports yet.</p>;
  return (
    <ul className="mt-3 grid gap-3">
      {submissions.data.map((submission) => (
        <li key={submission.id} className="bg-surface grid gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <b>{nameOf(submission.user)}</b>{" "}
              <span className="text-fg-muted">· {timeAgo(submission.createdAt)}</span>
            </p>
            {canPick && (
              <PickWinner
                bounty={bounty}
                userId={submission.user.id}
                name={nameOf(submission.user)}
              />
            )}
          </div>
          <Markdown content={submission.body} compact />
          {(submission.attachments.length > 0 || submission.captures.length > 0) && (
            <ul className="flex flex-wrap gap-2 text-sm">
              {submission.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-text inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <ExternalLink className="size-3.5" /> {file.fileName ?? file.type.toLowerCase()}
                  </a>
                </li>
              ))}
              {submission.captures.map((capture) => (
                <li key={capture.id}>
                  <a
                    href={capture.storageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-text inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <ExternalLink className="size-3.5" /> Action Cam {capture.type.toLowerCase()}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Participants({ bounty, canPick }: { bounty: Bounty; canPick: boolean }) {
  const people = api.bounties.participants.useQuery({ bountyId: bounty.id });
  if (people.isPending) return <Skeleton className="mt-3 h-32 w-full rounded-xl" />;
  if (people.isError)
    return (
      <ErrorState message="Couldn't load the participants." onRetry={() => void people.refetch()} />
    );
  if (people.data.length === 0)
    return <p className="text-fg-muted py-6 text-sm">Nobody has joined yet.</p>;
  return (
    <ul className="mt-3 divide-y rounded-xl border">
      {people.data.map((person) => (
        <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <b className="block truncate text-sm">{nameOf(person.user)}</b>
            <span className="text-fg-muted text-xs">
              Joined {timeAgo(person.joinedAt)}
              {person.totalTracks > 0
                ? ` · ${person.satisfiedCount}/${person.totalTracks} tracks (${person.progressPct}%)`
                : ""}
            </span>
          </div>
          {canPick && (
            <PickWinner bounty={bounty} userId={person.user.id} name={nameOf(person.user)} />
          )}
        </li>
      ))}
    </ul>
  );
}

function Winners({ bounty }: { bounty: Bounty }) {
  const currency = bounty.prizeCurrency as Currency;
  if (bounty.winners.length === 0)
    return <p className="text-fg-muted py-6 text-sm">No winners picked yet.</p>;
  return (
    <ul className="mt-3 divide-y rounded-xl border">
      {bounty.winners.map((winner) => (
        <li
          key={winner.id}
          className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
        >
          <b>{nameOf(winner.user)}</b>
          <span className="flex items-center gap-3">
            <Money amount={winner.prizeAmount} currency={currency} />
            <StatusPill tone={winner.claimedAt ? "success" : "neutral"}>
              {winner.claimedAt ? "Claimed" : "Not claimed yet"}
            </StatusPill>
          </span>
        </li>
      ))}
    </ul>
  );
}
