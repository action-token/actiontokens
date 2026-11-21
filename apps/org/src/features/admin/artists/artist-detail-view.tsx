"use client";

import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Heart,
  MapPin,
  Package,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@actiontokens/utils/address";
import { stellarExpertAccountUrl } from "@actiontokens/wallet/config";
import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { Avatar } from "@actiontokens/ui/patterns/person";
import { StatCard } from "@actiontokens/ui/patterns/stat-card";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../../shell/links";
import { useArtistActions } from "./artist-actions";
import { OrganizationStatus } from "./artist-status";

type Artist = RouterOutputs["admin"]["artists"]["get"];
type RecentPin = Artist["recentPins"][number];

const BACK = { href: "/admin/artists", label: "Organizations" };
const CARD = "bg-surface border-fg/10 rounded-[1.4rem] border-2";

/** Admin › one artist, following Wadzzo's creator page. */
export function ArtistDetailView({ organizationId }: { organizationId: string }) {
  const artist = api.admin.artists.get.useQuery(
    { organizationId },
    { refetchOnWindowFocus: false },
  );
  if (artist.isPending) return <DetailSkeleton />;
  if (artist.isError)
    return (
      <PageBody wide>
        <PageHeader back={BACK} eyebrow="Admin" title="Organization" />
        {artist.error.data?.code === "NOT_FOUND" ? (
          <EmptyState icon={Users} title="Organization not found" />
        ) : (
          <ErrorState
            message="Couldn't load this organization."
            onRetry={() => void artist.refetch()}
          />
        )}
      </PageBody>
    );
  return <Details artist={artist.data} />;
}

const copy = (text: string, what: string) =>
  void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

function Details({ artist }: { artist: Artist }) {
  const act = useArtistActions();
  const [now] = useState(() => Date.now());
  const ref = { id: artist.id, name: artist.name, paid: artist.issuer !== null };
  const stats = [
    { label: "Pins", icon: MapPin, value: artist.counts.pins },
    { label: "Collected", icon: Sparkles, value: artist.counts.collected },
    { label: "Followers", icon: Heart, value: artist.counts.followers },
    { label: "Items", icon: Package, value: artist.counts.items },
    { label: "Posts", icon: FileText, value: artist.counts.posts },
    { label: "Bounties", icon: Trophy, value: artist.counts.bounties },
  ];

  return (
    <PageBody wide>
      <Link
        href={BACK.href}
        className="text-fg-muted hover:text-fg mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
      >
        ← {BACK.label}
      </Link>

      {/* Cover + avatar */}
      <div className="relative">
        <div className="from-primary/25 via-surface-2 to-primary/5 border-border relative aspect-[851/315] max-h-60 w-full overflow-hidden rounded-xl border bg-gradient-to-br">
          {artist.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- covers come from our storage
            <img src={artist.coverUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <Avatar
          src={artist.avatarUrl}
          name={artist.name}
          className="border-bg absolute -bottom-10 left-4 size-24 border-4 text-3xl sm:-bottom-12 sm:left-6 sm:size-28"
        />
      </div>

      <div className="mt-12 flex flex-wrap items-start justify-between gap-4 sm:mt-4 sm:pl-40">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display truncate text-3xl sm:text-4xl">{artist.name}</h1>
            <OrganizationStatus status={artist.status} paid={ref.paid} />
          </div>
          <p className="text-fg-muted mt-1 max-w-2xl text-sm">{artist.bio ?? "No bio yet."}</p>
          {artist.rejectionReason && (
            <p className="text-fg-muted mt-1 text-sm">
              <b>Reason given:</b> {artist.rejectionReason}
            </p>
          )}
          <p className="text-fg-muted mt-1.5 flex flex-wrap items-center gap-x-2 text-xs">
            <span>Applied {timeAgo(artist.createdAt)}</span>
            <span aria-hidden>·</span>
            <Link
              href={`/admin/users/${artist.owner.id}`}
              className="hover:text-fg hover:underline"
            >
              {artist.owner.name ?? "Owner's account"}
            </Link>
            {artist.owner.walletAddress && (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => copy(artist.owner.walletAddress!, "Wallet")}
                  className="hover:text-fg inline-flex items-center gap-1 font-mono"
                >
                  {abbreviateAddress(artist.owner.walletAddress, 6)} <Copy className="size-3" />
                </button>
              </>
            )}
            {artist.owner.email && (
              <>
                <span aria-hidden>·</span>
                <span>{artist.owner.email}</span>
              </>
            )}
            {artist.owner.suspended && <StatusPill tone="danger">Account suspended</StatusPill>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {artist.status === "APPROVED" && (
            <Button variant="outline" asChild>
              <a href={`${FAN_APP_URL}/artist/${artist.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink /> Fan page
              </a>
            </Button>
          )}
          {artist.status === "PENDING" && (
            <>
              <Button
                variant="outline"
                className="text-danger hover:text-danger"
                disabled={act.busy}
                onClick={() => act.askReject(ref)}
              >
                <X /> Reject
              </Button>
              <Button disabled={act.busy || !ref.paid} onClick={() => act.approve(ref)}>
                <Check /> Approve
              </Button>
            </>
          )}
          {artist.status === "BANNED" ? (
            <Button variant="outline" disabled={act.busy} onClick={() => act.askUnban(ref)}>
              <UserCheck /> Unban
            </Button>
          ) : (
            artist.status !== "REJECTED" && (
              <Button
                variant="outline"
                className="text-danger hover:text-danger"
                disabled={act.busy}
                onClick={() => act.askBan(ref)}
              >
                <Ban /> Ban
              </Button>
            )
          )}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            icon={stat.icon}
            value={stat.value.toLocaleString()}
          />
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className={CARD}>
          <header className="border-border flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Recent pins</h2>
            <Link href="/admin/pins" className="text-fg-muted hover:text-fg text-xs">
              {artist.counts.pins.toLocaleString()} in total · Pin review
            </Link>
          </header>
          {artist.recentPins.length === 0 ? (
            <p className="text-fg-muted px-4 py-10 text-center text-sm">No pins yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {artist.recentPins.map((pin) => (
                <PinLine key={pin.id} pin={pin} now={now} />
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className={`${CARD} p-4`}>
            <h2 className="text-sm font-semibold">Fan token</h2>
            {artist.fanToken ? (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- covers come from our storage */}
                <img
                  src={artist.fanToken.coverUrl}
                  alt=""
                  className="border-border size-11 rounded-lg border object-cover"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-mono font-semibold">{artist.fanToken.code ?? "—"}</p>
                  <p className="text-fg-muted truncate text-xs">{artist.fanToken.title}</p>
                </div>
              </div>
            ) : artist.chosenFanToken ? (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- covers come from our storage */}
                <img
                  src={artist.chosenFanToken.coverUrl}
                  alt=""
                  className="border-border size-11 rounded-lg border object-cover"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-mono font-semibold">{artist.chosenFanToken.code}</p>
                  <p className="text-fg-muted text-xs">
                    {artist.chosenFanToken.mode === "EXISTING"
                      ? `Their own token on Stellar · made when you approve`
                      : "New token · made when you approve"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-fg-muted mt-2 text-sm">
                No fan token yet. The organization sets one up in Memberships.
              </p>
            )}
          </section>

          <section className={`${CARD} p-4`}>
            <h2 className="text-sm font-semibold">Accounts</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <Account
                label="Issuer"
                hint="Issues their fan token and items"
                publicKey={artist.issuer}
              />
              <Account
                label="Storage"
                hint="Holds copies to sell and give"
                publicKey={artist.storage}
              />
            </dl>
          </section>
        </div>
      </div>
      {act.dialogs}
    </PageBody>
  );
}

function Account({
  label,
  hint,
  publicKey,
}: {
  label: string;
  hint: string;
  publicKey: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className="font-medium">{label}</dt>
        <dd className="text-fg-muted text-xs">{hint}</dd>
      </div>
      {publicKey ? (
        <a
          href={stellarExpertAccountUrl(publicKey)}
          target="_blank"
          rel="noreferrer"
          className="text-primary-text shrink-0 font-mono text-xs hover:underline"
        >
          {abbreviateAddress(publicKey, 5)}
        </a>
      ) : (
        <span className="text-fg-faint shrink-0 text-xs">Not opened</span>
      )}
    </div>
  );
}

function PinLine({ pin, now }: { pin: RecentPin; now: number }) {
  const start = new Date(pin.startsAt).getTime();
  const end = new Date(pin.endsAt).getTime();
  const live = start <= now && end > now;
  const ended = end <= now;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {pin.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- pin images come from our storage
        <img src={pin.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="bg-surface-2 text-fg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <MapPin className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{pin.title}</p>
        <p className="text-fg-muted text-xs">
          {pin.spots} {pin.spots === 1 ? "spot" : "spots"} · {pin.claimed} collected ·{" "}
          {live ? "ends" : ended ? "ended" : "starts"}{" "}
          {timeAgo(new Date(live || ended ? end : start))}
        </p>
      </div>
      {pin.approval === "REJECTED" ? (
        <StatusPill tone="danger">Rejected</StatusPill>
      ) : pin.approval === "PENDING" ? (
        <StatusPill tone="warning">In review</StatusPill>
      ) : live && !pin.paused ? (
        <StatusPill tone="success" dot>
          Live
        </StatusPill>
      ) : (
        <StatusPill>{ended ? "Ended" : live ? "Paused" : "Scheduled"}</StatusPill>
      )}
    </li>
  );
}

function DetailSkeleton() {
  return (
    <PageBody wide>
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="aspect-[851/315] max-h-60 w-full rounded-xl" />
      <div className="mt-12 space-y-2 sm:mt-4 sm:pl-40">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[86px] rounded-xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </PageBody>
  );
}
