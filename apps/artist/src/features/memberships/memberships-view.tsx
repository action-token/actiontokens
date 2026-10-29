"use client";

import { Crown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { api, type RouterOutputs } from "~/trpc/react";

import { FanTokenSetup } from "./fan-token-setup";

type Tier = RouterOutputs["memberships"]["tiers"][number];

/** Your fan token and the tiers fans unlock by holding it. */
export function MembershipsView() {
  const token = api.memberships.fanToken.useQuery();

  return (
    <PageBody className="grid gap-6">
      <PageHeader eyebrow="Fans" title="Memberships" description="Fans unlock tiers by holding your fan token. There's nothing to bill: the amount they hold decides their tier." />
      {token.isPending ? (
        <Skeleton className="h-64 w-full max-w-2xl rounded-xl" />
      ) : token.isError ? (
        <ErrorState message="Couldn't load your fan token." onRetry={() => void token.refetch()} />
      ) : token.data === null ? (
        <FanTokenSetup />
      ) : (
        <>
          <section className="bg-surface flex max-w-2xl items-center gap-4 rounded-xl border p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={token.data.coverUrl} alt="" className="bg-surface-2 size-14 shrink-0 rounded-lg object-cover" />
            <div className="grid min-w-0 gap-0.5">
              <b className="font-mono">{token.data.code}</b>
              <span className="text-fg-muted truncate text-xs">
                {token.data.external ? "An asset you issued yourself" : "Issued by your artist account"} · {abbreviateAddress(token.data.issuer, 6)}
              </span>
            </div>
          </section>
          <Tiers tokenCode={token.data.code} />
        </>
      )}
    </PageBody>
  );
}

function Tiers({ tokenCode }: { tokenCode: string }) {
  const tiers = api.memberships.tiers.useQuery();
  const add = (
    <Button asChild>
      <Link href="/memberships/tiers/new">
        <Plus /> New tier
      </Link>
    </Button>
  );

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-xl">Tiers</h2>
        {tiers.data && tiers.data.length > 0 && add}
      </div>
      {tiers.isPending ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : tiers.isError ? (
        <ErrorState message="Couldn't load your tiers." onRetry={() => void tiers.refetch()} />
      ) : tiers.data.length === 0 ? (
        <EmptyState icon={Crown} title="No tiers yet" description={`Create a tier like "Supporter: hold 10 ${tokenCode}" and describe what it unlocks.`} action={add} />
      ) : (
        <ul className="grid gap-3">
          {tiers.data.map((tier) => (
            <TierCard key={tier.id} tier={tier} tokenCode={tokenCode} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TierCard({ tier, tokenCode }: { tier: Tier; tokenCode: string }) {
  const utils = api.useUtils();
  const [deleting, setDeleting] = useState(false);
  const refresh = () => void utils.memberships.tiers.invalidate();
  const toggle = api.memberships.updateTier.useMutation({ onSuccess: refresh, onError: (error) => toast.error(error.message) });
  const remove = api.memberships.removeTier.useMutation({
    onSuccess: () => {
      toast.success("Tier deleted");
      setDeleting(false);
      refresh();
    },
    onError: (error) => {
      setDeleting(false);
      toast.error(error.message);
    },
  });

  return (
    <li className="bg-surface grid gap-3 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display text-lg">{tier.name}</h3>
          <p className="text-fg-muted text-sm">
            Hold <span className="num font-semibold">{tier.requiredTokens}</span> {tokenCode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tier.isPopular && <Badge variant="secondary">Popular</Badge>}
          <StatusPill tone={tier.isActive ? "success" : "neutral"}>{tier.isActive ? "Shown" : "Hidden"}</StatusPill>
        </div>
      </div>
      {tier.description && <p className="text-sm">{tier.description}</p>}
      {tier.features.length > 0 && (
        <ul className="text-fg-muted grid gap-0.5 text-sm">
          {tier.features.map((perk) => (
            <li key={perk}>· {perk}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/memberships/tiers/${tier.id}`}>Edit</Link>
        </Button>
        <Button size="sm" variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate({ tierId: tier.id, isActive: !tier.isActive })}>
          {tier.isActive ? "Hide" : "Show"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${tier.name}?`}
        description={tier.inUse > 0 ? `${tier.inUse} items, posts or pins use this tier, so it can't be deleted. Hide it instead.` : "This can't be undone."}
        confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ tierId: tier.id })}
      />
    </li>
  );
}
