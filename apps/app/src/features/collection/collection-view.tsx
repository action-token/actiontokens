"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { FilterChips } from "@bandcoin/ui/patterns/toolbar";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api, type RouterInputs } from "~/trpc/react";

import { ItemCard } from "../catalog/item-card";

type TypeFilter = NonNullable<RouterInputs["collection"]["mine"]["type"]> | "ALL";

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "TRACK", label: "Music" },
  { value: "IMAGE", label: "Artwork" },
  { value: "VIDEO", label: "Video" },
  { value: "TICKET", label: "Tickets" },
  { value: "FAN_TOKEN", label: "Fan tokens" },
  { value: "MERCH", label: "Merch" },
  { value: "ROYALTY", label: "Royalties" },
];

const SOURCE_LABEL: Record<string, string> = {
  PURCHASE: "Bought",
  GIFT: "Gift",
  TRANSFER: "Received",
  CREATOR: "Yours",
  REDEEM: "Redeemed",
  PIN_CLAIM: "AR claim",
  BOUNTY: "Bounty prize",
};

/** Everything you own. Songs here play in full. */
export function CollectionView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [type, setType] = useState<TypeFilter>("ALL");
  const collection = api.collection.mine.useQuery(
    { type: type === "ALL" ? undefined : type },
    { enabled: status === "authenticated" },
  );

  if (status === "unauthenticated") {
    return (
      <EmptyState
        icon={Layers}
        title="Sign in to see your collection"
        description="Everything you buy, receive or claim lives here."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  }

  const items = collection.data?.items ?? [];
  return (
    <div className="grid gap-6">
      <FilterChips label="Type" value={type} onChange={setType} options={TYPES} />
      {collection.isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="aspect-[3/4] rounded-[1.4rem]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={type === "ALL" ? "Nothing here yet" : "None of these yet"}
          description="Buy a song, claim an AR pin or win a bounty, and it shows up here."
          action={
            <Button asChild variant="secondary">
              <Link href="/marketplace">Browse the marketplace</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <div key={item.id} className="relative">
              <ItemCard item={item} queue={items} />
              <span className="pointer-events-none absolute -top-2 -left-2 z-20 flex gap-1">
                <span className="bg-fg text-bg rounded-md px-2 py-0.5 text-[11px] font-bold shadow">
                  {SOURCE_LABEL[item.source] ?? "Owned"}
                </span>
                {item.quantity > 1 && (
                  <span className="bg-primary text-primary-foreground display rounded-md px-1.5 py-0.5 text-sm shadow">
                    ×{item.quantity.toLocaleString()}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
