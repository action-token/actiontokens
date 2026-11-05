"use client";

import { Archive, Check, Crown, Package, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api, type RouterOutputs } from "~/trpc/react";

import { StorageStock } from "../catalog/storage-stock";
import { FanTokenSetup } from "./fan-token-setup";
import { PageAssets } from "./page-assets";

type Tier = RouterOutputs["memberships"]["tiers"][number];
type FanToken = NonNullable<RouterOutputs["memberships"]["fanToken"]>;
type Tab = "tiers" | "bundles" | "storage";

const amount = (value: string) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 7 });

export function MembershipsView() {
  // useSearchParams needs a boundary; the page renders right away and the tab follows
  return (
    <Suspense>
      <MembershipTabs />
    </Suspense>
  );
}

/**
 * Your fan token and what it does: a strip with the token and its numbers,
 * then tabs: the tiers fans unlock by holding it, bundles of it for sale, and
 * copies kept in storage.
 */
function MembershipTabs() {
  const router = useRouter();
  const asked = useSearchParams().get("tab");
  const token = api.memberships.fanToken.useQuery();
  const storage = token.data && !token.data.external;
  const tab: Tab = asked === "bundles" || (asked === "storage" && storage) ? asked : "tiers";

  return (
    <PageBody wide className="grid gap-6">
      <PageHeader
        eyebrow="Fans"
        title="Memberships"
        description="Fans unlock tiers by holding your fan token. There's nothing to bill: the amount they hold decides their tier."
        actions={
          token.data ? (
            <Button asChild>
              <Link href="/memberships/tiers/new">
                <Plus /> New tier
              </Link>
            </Button>
          ) : undefined
        }
      />
      {token.isPending ? (
        <Skeleton className="h-24 w-full rounded-[1.4rem]" />
      ) : token.isError ? (
        <ErrorState message="Couldn't load your fan token." onRetry={() => void token.refetch()} />
      ) : token.data === null ? (
        <FanTokenSetup />
      ) : (
        <>
          <TokenStrip token={token.data} />
          <Tabs
            value={tab}
            onValueChange={(value) =>
              router.replace(value === "tiers" ? "/memberships" : `/memberships?tab=${value}`)
            }
          >
            <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
              <TabsTrigger value="tiers" className="flex-none">
                <Crown /> Tiers
              </TabsTrigger>
              <TabsTrigger value="bundles" className="flex-none">
                <Package /> Sell bundles
              </TabsTrigger>
              {storage && (
                <TabsTrigger value="storage" className="flex-none">
                  <Archive /> Storage
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
          {tab === "tiers" && <Tiers tokenCode={token.data.code} />}
          {tab === "bundles" && <PageAssets />}
          {tab === "storage" && (
            <div className="max-w-2xl">
              <StorageStock itemId={token.data.itemId} />
            </div>
          )}
        </>
      )}
    </PageBody>
  );
}

/** The token and its numbers in one line: what storage holds, what's free to offer, tiers, bundles. */
function TokenStrip({ token }: { token: FanToken }) {
  const tiers = api.memberships.tiers.useQuery();
  const assets = api.catalog.pageAssets.useQuery();
  const openBundles = assets.data?.offers.filter((offer) => !offer.sold).length;

  const stats: { label: string; value: string | null | undefined }[] = [
    {
      label: "In storage",
      value: assets.data ? (assets.data.held != null ? amount(assets.data.held) : null) : undefined,
    },
    {
      label: "Free to offer",
      value: assets.data ? (assets.data.free != null ? amount(assets.data.free) : null) : undefined,
    },
    { label: "Tiers", value: tiers.data ? String(tiers.data.length) : undefined },
    {
      label: "Bundles on sale",
      value: openBundles !== undefined ? String(openBundles) : undefined,
    },
  ];

  return (
    <section className="bg-surface border-fg/10 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[1.4rem] border-2 p-5">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={token.coverUrl}
          alt=""
          className="bg-surface-2 size-12 shrink-0 rounded-xl object-cover"
        />
        <div className="min-w-0">
          <p className="display truncate text-2xl">{token.code}</p>
          <p className="text-fg-muted truncate text-xs">
            {token.external ? "Issued by you" : "Issued by your artist account"} ·{" "}
            {abbreviateAddress(token.issuer, 4)}
          </p>
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-fg-muted truncate text-xs">{stat.label}</dt>
            <dd className="num mt-0.5 text-lg font-semibold">
              {stat.value === undefined ? <Skeleton className="h-6 w-12" /> : (stat.value ?? "—")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Tiers({ tokenCode }: { tokenCode: string }) {
  const tiers = api.memberships.tiers.useQuery();

  return (
    <section className="grid gap-4" aria-label="Tiers">
      {tiers.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-56 rounded-[1.4rem]" />
          <Skeleton className="h-56 rounded-[1.4rem]" />
        </div>
      ) : tiers.isError ? (
        <ErrorState message="Couldn't load your tiers." onRetry={() => void tiers.refetch()} />
      ) : tiers.data.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="No tiers yet"
          description={`Create a tier like "Supporter: hold 10 ${tokenCode}" and describe what it unlocks.`}
          action={
            <Button asChild>
              <Link href="/memberships/tiers/new">
                <Plus /> New tier
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tiers.data.map((tier, index) => (
            <TierCard key={tier.id} tier={tier} index={index} tokenCode={tokenCode} />
          ))}
          <li>
            <Link
              href="/memberships/tiers/new"
              className="text-fg-muted hover:border-primary-text hover:text-fg flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-[1.4rem] border-2 border-dashed text-sm transition-colors"
            >
              <Plus className="size-5" /> Add a tier
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}

function TierCard({ tier, index, tokenCode }: { tier: Tier; index: number; tokenCode: string }) {
  const utils = api.useUtils();
  const [deleting, setDeleting] = useState(false);
  const refresh = () => void utils.memberships.tiers.invalidate();
  const toggle = api.memberships.updateTier.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
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
    <li
      className={cn(
        "bg-surface border-fg/10 flex flex-col rounded-[1.4rem] border-2 p-5",
        tier.isPopular && "border-primary-text/50",
        !tier.isActive && "opacity-70",
      )}
    >
      <p className="text-primary-text flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        Tier {index + 1}
        {tier.isPopular && (
          <span className="bg-primary-soft inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] tracking-normal normal-case">
            <Star className="size-3" /> Popular
          </span>
        )}
        {!tier.isActive && (
          <span className="bg-surface-2 text-fg-muted rounded-full px-1.5 py-0.5 text-[10px] tracking-normal normal-case">
            Hidden
          </span>
        )}
      </p>
      <h3 className="display mt-1 truncate text-2xl">{tier.name}</h3>
      <p className="mt-2">
        <span className="num text-2xl font-semibold">{tier.requiredTokens}</span>{" "}
        <span className="text-fg-muted text-sm">{tokenCode} to hold</span>
      </p>
      {tier.description && <p className="text-fg-muted mt-2 text-sm">{tier.description}</p>}
      {tier.features.length > 0 && (
        <ul className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
          {tier.features.map((perk) => (
            <li key={perk} className="flex gap-2">
              <Check className="text-primary-text mt-0.5 size-4 shrink-0" /> {perk}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/memberships/tiers/${tier.id}`}>Edit</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ tierId: tier.id, isActive: !tier.isActive })}
        >
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
        description={
          tier.inUse > 0
            ? `${tier.inUse} items, posts or pins use this tier, so it can't be deleted. Hide it instead.`
            : "This can't be undone."
        }
        confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ tierId: tier.id })}
      />
    </li>
  );
}
