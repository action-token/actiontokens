import { ChevronDown, ChevronRight, ExternalLink, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import { Money } from "~/components/money";
import { ItemCard } from "~/features/catalog/item-card";
import { Avatar } from "~/features/shell/context-panel";
import { TYPE_LABEL } from "~/lib/item-types";
import type { RouterOutputs } from "~/trpc/react";

type Item = RouterOutputs["item"]["bySlug"];
type More = RouterOutputs["catalog"]["moreFromArtist"];

export const royaltyOf = (item: Item) =>
  Number(item.royaltyPercent ?? (item.contractNft ? item.contractNft.royaltyBps / 100 : 0));

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-border divide-y-2 divide-dashed rounded-[1.2rem] border-2 text-sm">
      {rows.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-fg-muted font-semibold">{key}</dt>
          <dd className="truncate font-mono text-[13px] font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A collapsible section (Details, Activity). */
function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details
      open={open}
      className="group bg-surface rounded-[1.2rem] border-2 px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="display flex cursor-pointer list-none items-center justify-between text-2xl">
        {title}
        <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 pt-4">{children}</div>
    </details>
  );
}

/** The description, the numbers the hero doesn't show, the artist and (folded) the blockchain facts. */
export function ItemDetails({ item, single = false }: { item: Item; single?: boolean }) {
  const facts: [string, string][] = [
    ["Type", TYPE_LABEL[item.type] ?? item.type],
    ["Sold", item.sold.toLocaleString()],
    ["Owners", item.holders.toLocaleString()],
  ];
  // Only collectors who care about the blockchain need these, so they stay folded.
  const technical: [string, string][] = [
    ...(item.classicToken
      ? ([
          ["Token code", item.classicToken.code],
          [
            "Issuer",
            `${item.classicToken.issuer.slice(0, 6)}…${item.classicToken.issuer.slice(-6)}`,
          ],
        ] as [string, string][])
      : []),
    [
      "Network",
      item.chainType === "OFF_CHAIN"
        ? "Not on Stellar (Bandcoin keeps track of owners)"
        : item.network === "mainnet"
          ? "Stellar"
          : "Stellar testnet",
    ],
  ];
  const explorer = item.classicToken
    ? `https://stellar.expert/explorer/${item.network === "mainnet" ? "public" : "testnet"}/asset/${item.classicToken.code}-${item.classicToken.issuer}`
    : null;

  return (
    <Fold title="Details" open>
      <p className="text-fg-muted text-[15px] leading-relaxed whitespace-pre-line">
        {item.description?.trim() ? item.description : "No description yet."}
      </p>
      <div className={cn("grid gap-5", !single && "lg:grid-cols-2")}>
        <div className="grid content-start gap-3">
          <Facts rows={facts} />
          <details>
            <summary className="text-fg-muted hover:text-fg cursor-pointer text-sm font-semibold">
              Technical details
            </summary>
            <div className="grid gap-3 pt-3">
              <Facts rows={technical} />
              {explorer && (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="marker text-primary-text inline-flex items-center gap-1.5 text-base hover:underline"
                >
                  view on stellar expert <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </details>
        </div>
        <div className="grid content-start gap-4">
          {item.artist && (
            <Link
              href={`/artist/${item.artist.slug}`}
              className="group hover:border-fg flex items-center gap-3 rounded-[1.2rem] border-2 p-3 transition-colors"
            >
              <Avatar
                name={item.artist.name}
                url={item.artist.avatarUrl}
                className="bg-surface-3 grid size-12 shrink-0 place-items-center rounded-full object-cover text-sm font-bold"
              />
              <span className="min-w-0 flex-1">
                <span className="marker text-fg-muted block text-sm">made by</span>
                <span className="display block truncate text-2xl">{item.artist.name}</span>
                {item.artist.bio && (
                  <span className="text-fg-muted line-clamp-1 text-sm">{item.artist.bio}</span>
                )}
              </span>
              <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:-rotate-45">
                <ChevronRight className="size-5" strokeWidth={2.6} />
              </span>
            </Link>
          )}
        </div>
      </div>
    </Fold>
  );
}

export function ItemActivity({ sales, open }: { sales: Item["recentSales"]; open?: boolean }) {
  return (
    <Fold title="Activity" open={open}>
      {sales.length === 0 ? (
        <p className="text-fg-muted text-sm">No sales yet. Be the first.</p>
      ) : (
        <ul className="divide-border divide-y text-sm">
          {sales.map((sale) => (
            <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <b className="font-semibold">{sale.buyer}</b> bought {sale.quantity}
              </span>
              <span className="text-fg-muted flex items-center gap-3">
                <Money amount={sale.total} currency={sale.currency} />
                <time dateTime={sale.at.toISOString()}>
                  {sale.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  );
}

export function MoreFromArtist({
  more,
  artistName,
  compact = false,
}: {
  more: More;
  artistName: string;
  /** One row of three, for a narrow column */
  compact?: boolean;
}) {
  if (!more || more.items.length === 0) return null;
  const items = compact ? more.items.slice(0, 3) : more.items;
  return (
    <section
      className="grid gap-4 pt-4"
      aria-label={`More from ${more.artist?.name ?? artistName}`}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="display text-3xl">More from {more.artist?.name ?? artistName}</h2>
          <p className="marker text-fg-muted text-base">same artist, more drops</p>
        </div>
        {more.artist && (
          <Link
            href={`/artist/${more.artist.slug}`}
            className="text-fg-muted hover:text-fg shrink-0 text-sm font-semibold"
          >
            See all
          </Link>
        )}
      </div>
      <div
        className={cn(
          "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3",
          !compact && "lg:grid-cols-5",
        )}
      >
        {items.map((entry) => (
          <ItemCard key={entry.id} item={entry} queue={items} />
        ))}
      </div>
    </section>
  );
}

/** A members-only or tier item the viewer can't buy yet: what unlocks it, and where to get the token. */
export function AccessNotice({
  access,
  artist,
}: {
  access: { tierName: string | null; code: string | null; reason: string | null };
  artist: { name: string; slug: string } | null;
}) {
  return (
    <p
      role="note"
      className="bg-surface-2 mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl p-4 text-sm"
    >
      <Lock className="text-primary-text size-4 shrink-0" />
      <span className="font-semibold">
        {access.tierName ? `For ${access.tierName} members.` : "For members."}
      </span>
      <span className="text-fg-muted">{access.reason}</span>
      {artist && access.code && (
        <Link
          href={`/artist/${artist.slug}`}
          className="text-primary-text font-semibold hover:underline"
        >
          Get {access.code} from {artist.name}
        </Link>
      )}
    </p>
  );
}
