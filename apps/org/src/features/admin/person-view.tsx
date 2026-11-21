"use client";

import {
  Activity,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  Heart,
  MapPin,
  Mic2,
  Package,
  Receipt,
  Shield,
  ShoppingBag,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@actiontokens/utils/address";
import { stellarExpertAccountUrl } from "@actiontokens/wallet/config";
import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { Avatar } from "@actiontokens/ui/patterns/person";
import { StatCard } from "@actiontokens/ui/patterns/stat-card";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { ActivityList } from "./activity-list";
import { OrganizationStatus } from "./artists/artist-status";
import { useUserActions } from "./user-actions";

type Person = RouterOutputs["admin"]["users"]["get"];
type Kind = "all" | "signIn" | "money" | "claims" | "uploads" | "bounties" | "failed";

const BACK = { href: "/admin/users", label: "Users" };
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "signIn", label: "Sign-ins" },
  { value: "money", label: "Payments" },
  { value: "claims", label: "Pin claims" },
  { value: "uploads", label: "Uploads" },
  { value: "bounties", label: "Bounties" },
  { value: "failed", label: "Failed" },
];

/** Admin › Users › one account, following Wadzzo's: who they are, then what they collected, redeemed, own and did. */
export function PersonView({ userId }: { userId: string }) {
  const person = api.admin.users.get.useQuery({ userId }, { refetchOnWindowFocus: false });
  if (person.isPending) return <PersonSkeleton />;
  if (person.isError)
    return (
      <PageBody wide>
        <PageHeader back={BACK} eyebrow="Admin" title="User" />
        {person.error.data?.code === "NOT_FOUND" ? (
          <EmptyState icon={Users} title="User not found" />
        ) : (
          <ErrorState message="Couldn't load this user." onRetry={() => void person.refetch()} />
        )}
      </PageBody>
    );
  return <Details person={person.data} />;
}

function Details({ person }: { person: Person }) {
  const me = useSession().data?.user.id;
  const { actionsFor, dialogs } = useUserActions(me);
  const [kind, setKind] = useState<Kind>("all");
  const title =
    person.name ??
    (person.walletAddress ? abbreviateAddress(person.walletAddress, 6) : "No name yet");
  const actions = actionsFor({
    id: person.id,
    name: person.name,
    role: person.role,
    suspended: Boolean(person.suspended),
  });
  const copyWallet = (wallet: string) =>
    void navigator.clipboard.writeText(wallet).then(() => toast.success("Wallet copied"));

  return (
    <PageBody wide>
      <Link
        href={BACK.href}
        className="text-fg-muted hover:text-fg mb-4 inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
      >
        ← {BACK.label}
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Avatar src={person.avatarUrl} name={title} className="size-16 text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display truncate text-3xl sm:text-4xl">{title}</h1>
            {person.role === "ADMIN" && (
              <StatusPill tone="info" icon={Shield}>
                Admin
              </StatusPill>
            )}
            {person.artist && (
              <OrganizationStatus
                status={person.artist.status}
                paid={person.artist.issuer !== null}
              />
            )}
            {person.suspended && <StatusPill tone="danger">Suspended</StatusPill>}
          </div>
          <p className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            {person.username && <span>@{person.username}</span>}
            {person.email && <span>{person.email}</span>}
            {person.walletAddress && (
              <button
                type="button"
                onClick={() => copyWallet(person.walletAddress!)}
                className="hover:text-fg inline-flex items-center gap-1 font-mono text-xs"
              >
                {abbreviateAddress(person.walletAddress, 6)} <Copy className="size-3" />
              </button>
            )}
          </p>
          <p className="text-fg-muted mt-1 text-xs">
            Joined {timeAgo(person.createdAt)}
            {person.signUpMethod && ` with ${person.signUpMethod}`} · last active{" "}
            {person.lastActiveAt ? timeAgo(person.lastActiveAt) : "never"}
          </p>
          <Wallet person={person} />
        </div>
        <div className="flex flex-wrap gap-2">
          {person.artist && (
            <Button variant="outline" asChild>
              <Link href={`/admin/artists/${person.artist.id}`}>
                <Mic2 /> View artist
              </Link>
            </Button>
          )}
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              className={action.destructive ? "text-danger hover:text-danger" : undefined}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.icon && <action.icon />} {action.label}
            </Button>
          ))}
        </div>
      </header>

      {person.suspended && (
        <p role="status" className="bg-danger-soft text-danger mt-4 rounded-xl px-4 py-3 text-sm">
          Suspended {timeAgo(person.suspended.at)}
          {person.suspended.reason && <>: {person.suspended.reason}</>}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Pins collected"
          icon={MapPin}
          value={person.counts.pinsCollected.toLocaleString()}
        />
        <StatCard
          label="Codes redeemed"
          icon={Ticket}
          value={person.counts.redeemed.toLocaleString()}
        />
        <StatCard label="Items owned" icon={Package} value={person.counts.owned.toLocaleString()} />
        <StatCard label="Following" icon={Heart} value={person.counts.following.toLocaleString()} />
      </dl>

      <Tabs defaultValue="pins" className="mt-8">
        <TabsList variant="line" className="max-w-full overflow-x-auto">
          <TabsTrigger value="pins">
            <MapPin /> Collected <TabCount n={person.counts.pinsCollected} />
          </TabsTrigger>
          <TabsTrigger value="redeems">
            <Ticket /> Codes redeemed <TabCount n={person.counts.redeemed} />
          </TabsTrigger>
          <TabsTrigger value="items">
            <Package /> Items <TabCount n={person.counts.owned} />
          </TabsTrigger>
          <TabsTrigger value="orders">
            <Receipt /> Orders <TabCount n={person.counts.orders} />
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity /> Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pins" className="mt-4">
          <List
            empty="Hasn't collected any pins yet."
            more={person.counts.pinsCollected - person.pinsCollected.length}
            items={person.pinsCollected.map((claim) => ({
              key: claim.id,
              image: claim.pin.imageUrl,
              icon: MapPin,
              title: claim.pin.title,
              sub: (
                <>
                  <Link
                    href={`/admin/artists/${claim.pin.organization.id}`}
                    className="hover:underline"
                  >
                    {claim.pin.organization.name}
                  </Link>{" "}
                  · {timeAgo(claim.at)}
                </>
              ),
              end: claim.redeemed ? (
                <StatusPill tone="success" icon={CheckCircle2}>
                  Redeemed
                </StatusPill>
              ) : null,
            }))}
          />
        </TabsContent>
        <TabsContent value="redeems" className="mt-4">
          <List
            empty="Hasn't redeemed any codes."
            more={person.counts.redeemed - person.redeemed.length}
            items={person.redeemed.map((claim) => ({
              key: claim.id,
              icon: Ticket,
              title: <span className="font-mono tracking-wider">{claim.code}</span>,
              sub: `${claim.item.title} · ${timeAgo(claim.at)}`,
            }))}
          />
        </TabsContent>
        <TabsContent value="items" className="mt-4">
          <List
            empty="Doesn't own any items."
            more={person.counts.owned - person.owned.length}
            items={person.owned.map((row) => ({
              key: row.item.id,
              image: row.item.coverUrl,
              icon: Package,
              title: row.item.title,
              sub: `${labelOf(row.source)} · ${timeAgo(row.acquiredAt)}`,
              end: <span className="num text-fg-muted text-sm">×{Number(row.quantity)}</span>,
            }))}
          />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <List
            empty="No orders."
            more={person.counts.orders - person.orders.length}
            items={person.orders.map((order) => ({
              key: order.id,
              icon: Receipt,
              title: order.item?.title ?? labelOf(order.kind),
              sub: `${order.status.toLowerCase()} · ${timeAgo(order.createdAt)}`,
              end: <Money amount={order.total} currency={order.currency} />,
            }))}
          />
        </TabsContent>
        <TabsContent value="activity" className="mt-4 grid gap-3">
          <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
            <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
              {KINDS.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value} className="flex-none">
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
        </TabsContent>
      </Tabs>
      {dialogs}
    </PageBody>
  );
}

/** Spendable balances, on one line under the header. */
function Wallet({ person }: { person: Person }) {
  if (!person.walletAddress) return null;
  return (
    <p className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-3 text-xs">
      {person.balances ? (
        (["ACTION", "XLM", "USDC"] as const).map((currency) => (
          <Money key={currency} amount={person.balances![currency]} currency={currency} />
        ))
      ) : (
        <span>Wallet not on the network yet</span>
      )}
      <a
        href={stellarExpertAccountUrl(person.walletAddress)}
        target="_blank"
        rel="noreferrer"
        className="hover:text-fg inline-flex items-center gap-1"
      >
        Explorer <ExternalLink className="size-3" />
      </a>
    </p>
  );
}

/** "ITEM_PURCHASE" → "Item purchase" */
const labelOf = (kind: string) => kind.charAt(0) + kind.slice(1).toLowerCase().replaceAll("_", " ");

function TabCount({ n }: { n: number }) {
  return <span className="text-fg-muted num text-xs">{n.toLocaleString()}</span>;
}

type Item = {
  key: string;
  image?: string | null;
  icon: typeof MapPin;
  title: ReactNode;
  sub: ReactNode;
  end?: ReactNode;
};

function List({ items, empty, more }: { items: Item[]; empty: string; more: number }) {
  if (!items.length)
    return (
      <p className="text-fg-muted border-border rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        {empty}
      </p>
    );
  return (
    <div className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2">
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-2.5">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
              <img src={item.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="bg-surface-2 text-fg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <item.icon className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-fg-muted truncate text-xs">{item.sub}</p>
            </div>
            {item.end}
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="text-fg-muted border-border border-t px-4 py-2 text-center text-xs">
          Showing the latest {items.length} · {more.toLocaleString()} more
        </p>
      )}
    </div>
  );
}

function PersonSkeleton() {
  return (
    <PageBody wide>
      <Skeleton className="mb-4 h-3 w-16" />
      <div className="flex items-start gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[86px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-10 w-80" />
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </PageBody>
  );
}
