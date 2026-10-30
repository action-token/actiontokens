"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { stellarExpertAccountUrl } from "@bandcoin/wallet/config";
import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";
import { ActivityList } from "./activity-list";
import { useUserActions } from "./user-actions";

type Person = RouterOutputs["admin"]["users"]["get"];
type Kind = "all" | "signIn" | "money" | "claims" | "uploads" | "bounties" | "failed";

const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "signIn", label: "Sign-ins" },
  { value: "money", label: "Payments" },
  { value: "claims", label: "Pin claims" },
  { value: "uploads", label: "Uploads" },
  { value: "bounties", label: "Bounties" },
  { value: "failed", label: "Failed" },
];

const ROLE: Record<Person["role"], { tone: Tone; label: string }> = {
  FAN: { tone: "neutral", label: "Fan" },
  ARTIST: { tone: "info", label: "Artist" },
  ADMIN: { tone: "warning", label: "Admin" },
};

const ARTIST_STATUS: Record<
  NonNullable<Person["artist"]>["status"],
  { tone: Tone; label: string }
> = {
  PENDING: { tone: "warning", label: "Waiting for review" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "neutral", label: "Rejected" },
  BANNED: { tone: "danger", label: "Banned" },
};

/** One person: who they are, what they hold and did, and their activity timeline. */
export function PersonView({ userId }: { userId: string }) {
  const person = api.admin.users.get.useQuery({ userId });

  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/admin/users", label: "Users" }} eyebrow="Admin" title="Person" />
      {person.isPending ? (
        <PersonSkeleton />
      ) : person.isError ? (
        <ErrorState message={person.error.message} onRetry={() => void person.refetch()} />
      ) : (
        <Details person={person.data} />
      )}
    </PageBody>
  );
}

function Details({ person }: { person: Person }) {
  const me = useSession().data?.user.id;
  const { actionsFor, dialogs } = useUserActions(me);
  const [kind, setKind] = useState<Kind>("all");
  const actions = actionsFor({
    id: person.id,
    name: person.name,
    role: person.role,
    suspended: Boolean(person.suspended),
  });

  return (
    <>
      <section className="bg-surface grid gap-4 rounded-[1.4rem] border-2 p-5 sm:flex sm:items-start">
        <Avatar className="size-16 shrink-0">
          {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
            {(person.name ?? "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="display truncate text-2xl">{person.name ?? "No name yet"}</h2>
            <StatusPill tone={ROLE[person.role].tone}>{ROLE[person.role].label}</StatusPill>
            {person.suspended && <StatusPill tone="danger">Suspended</StatusPill>}
          </div>
          <p className="text-fg-muted text-sm">
            {[person.username && `@${person.username}`, person.email, person.signUpMethod]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-fg-muted text-sm">
            Joined {timeAgo(person.createdAt)} · last active{" "}
            {person.lastActiveAt ? timeAgo(person.lastActiveAt) : "never"}
          </p>
          {person.walletAddress && (
            <a
              href={stellarExpertAccountUrl(person.walletAddress)}
              target="_blank"
              rel="noreferrer"
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1 justify-self-start font-mono text-xs"
              title={person.walletAddress}
            >
              {abbreviateAddress(person.walletAddress, 8)} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.destructive ? "destructive" : "outline"}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.icon && <action.icon />} {action.label}
            </Button>
          ))}
        </div>
      </section>

      {person.suspended && (
        <p role="status" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          Suspended {timeAgo(person.suspended.at)}
          {person.suspended.reason && <>: {person.suspended.reason}</>}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="grid content-start gap-3">
          <h2 className="text-base font-semibold">Activity</h2>
          <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
            <TabsList className="max-w-full overflow-x-auto">
              {KINDS.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value}>
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <ActivityList
            hideActor
            filter={{
              limit: 30,
              actorId: person.id,
              kind: kind === "all" || kind === "failed" ? undefined : kind,
              failedOnly: kind === "failed" || undefined,
            }}
            emptyText="Nothing of this kind yet."
          />
        </section>

        <aside className="grid content-start gap-4">
          <Card title="Wallet">
            {person.balances ? (
              <dl className="grid gap-1.5 text-sm">
                {(["BANDCOIN", "XLM", "USDC"] as const).map((currency) => (
                  <Line key={currency} label={currency}>
                    <Money amount={person.balances![currency]} currency={currency} />
                  </Line>
                ))}
              </dl>
            ) : (
              <p className="text-fg-muted text-sm">
                {person.walletAddress ? "Not on the network yet." : "No wallet."}
              </p>
            )}
          </Card>

          <Card title="On Bandcoin">
            <dl className="grid gap-1.5 text-sm">
              <Line label="Items owned">{person.counts.owned}</Line>
              <Line label="Pins collected">{person.counts.pinsCollected}</Line>
              <Line label="Rewards redeemed">{person.counts.redeemed}</Line>
              <Line label="Following">{person.counts.following}</Line>
              <Line label="Orders">{person.counts.orders}</Line>
            </dl>
          </Card>

          {person.artist && (
            <Card title="Artist">
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{person.artist.name}</b>
                  <StatusPill tone={ARTIST_STATUS[person.artist.status].tone}>
                    {ARTIST_STATUS[person.artist.status].label}
                  </StatusPill>
                </div>
                <dl className="grid gap-1.5">
                  <Line label="Items">{person.artist.counts.items}</Line>
                  <Line label="Pins">{person.artist.counts.pins}</Line>
                  <Line label="Followers">{person.artist.counts.followers}</Line>
                  <Line label="Issuer">
                    <Account publicKey={person.artist.issuer} />
                  </Line>
                  <Line label="Storage">
                    <Account publicKey={person.artist.storage} />
                  </Line>
                </dl>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`${FAN_APP_URL}/artist/${person.artist.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink /> Their page
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/admin/artists">Review in Artists</Link>
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card title="Latest orders">
            {person.orders.length === 0 ? (
              <p className="text-fg-muted text-sm">No orders.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {person.orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {order.item?.title ?? labelOf(order.kind)}
                      </span>
                      <span className="text-fg-faint text-xs">
                        {order.status.toLowerCase()} · {timeAgo(order.createdAt)}
                      </span>
                    </span>
                    <Money amount={order.total} currency={order.currency} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Owns">
            {person.owned.length === 0 ? (
              <p className="text-fg-muted text-sm">Nothing yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {person.owned.map((row) => (
                  <li key={row.item.id} className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- covers come from our storage */}
                    <img src={row.item.coverUrl} alt="" className="size-8 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate">{row.item.title}</span>
                    <span className="num text-fg-muted">×{Number(row.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
      {dialogs}
    </>
  );
}

/** "ITEM_PURCHASE" → "Item purchase" */
const labelOf = (kind: string) => kind.charAt(0) + kind.slice(1).toLowerCase().replaceAll("_", " ");

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-surface grid gap-3 rounded-[1.2rem] border-2 p-4">
      <h3 className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="num">{children}</dd>
    </div>
  );
}

function Account({ publicKey }: { publicKey: string | null }) {
  if (!publicKey) return <span className="text-fg-faint">Not open</span>;
  return (
    <a
      href={stellarExpertAccountUrl(publicKey)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs hover:underline"
      title={publicKey}
    >
      {abbreviateAddress(publicKey, 5)}
    </a>
  );
}

function PersonSkeleton() {
  return (
    <>
      <Skeleton className="h-32 w-full rounded-[1.4rem]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-2">
          <Skeleton className="h-9 w-full max-w-xl" />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
        <div className="grid content-start gap-4">
          <Skeleton className="h-32 rounded-[1.2rem]" />
          <Skeleton className="h-44 rounded-[1.2rem]" />
        </div>
      </div>
    </>
  );
}
