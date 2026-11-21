"use client";

import { PackageOpen, Tag } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { isAppError } from "@actiontokens/errors";
import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Input } from "@actiontokens/ui/components/input";
import { Label } from "@actiontokens/ui/components/label";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { useResaleOrder } from "./use-resale-order";

type Listing = RouterOutputs["resale"]["mine"][number];
const PRICE = /^\d{1,12}(\.\d{1,7})?$/;

/** What you're selling (change a price, take unsold copies back) and what has sold. */
export function SellingView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const mine = api.resale.mine.useQuery(undefined, { enabled: status === "authenticated" });
  const sold = api.resale.sold.useQuery(undefined, { enabled: status === "authenticated" });
  const order = useResaleOrder();
  const [pricing, setPricing] = useState<Listing | null>(null);
  const [taking, setTaking] = useState<Listing | null>(null);

  if (status === "unauthenticated")
    return (
      <EmptyState
        icon={Tag}
        title="Sign in to sell"
        description="Copies you own can be listed at your own price."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  if (status === "loading" || mine.isPending)
    return (
      <div className="grid gap-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );

  const listings = mine.data ?? [];
  return (
    <>
      <Tabs defaultValue="listings" className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="listings" className="font-hud flex-none">
            Listings
          </TabsTrigger>
          <TabsTrigger value="sold" className="font-hud flex-none">
            Sold
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="grid gap-3">
          {listings.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="Nothing listed yet"
              description="Open an item you own and choose Sell. You set the price."
              action={
                <Button asChild variant="secondary">
                  <Link href="/collection">My collection</Link>
                </Button>
              }
            />
          ) : (
            listings.map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                busy={order.busy}
                onPrice={() => setPricing(listing)}
                onTakeBack={() => setTaking(listing)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="sold" className="grid gap-2">
          {sold.isPending ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (sold.data ?? []).length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="Nothing sold yet"
              description="When someone buys one of your copies it shows up here."
            />
          ) : (
            sold.data?.map((sale) => (
              <div
                key={sale.id}
                className="bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <Link
                  href={`/item/${sale.item?.slug ?? ""}`}
                  className="min-w-0 font-semibold hover:underline"
                >
                  {sale.quantity} × {sale.item?.title}
                </Link>
                <span className="text-fg-muted flex items-center gap-3">
                  <Money
                    amount={Number(sale.unitPrice) * sale.quantity}
                    currency={sale.currency}
                    className="text-fg font-semibold"
                  />
                  {timeAgo(sale.createdAt)}
                </span>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {pricing && (
        <PriceDialog
          listing={pricing}
          onClose={() => setPricing(null)}
          onRelist={async (prices) => {
            const listing = pricing;
            setPricing(null);
            await order.run({
              kind: "list",
              input: { itemId: listing.itemId, amount: 1, ...prices, listingIds: [listing.id] },
              summary: (
                <>
                  New price for {listing.item.title} #{listing.tokenId}
                </>
              ),
              done: { title: "Price changed", body: "The new price is on the network now." },
            });
          }}
        />
      )}
      {taking && (
        <TakeBackDialog
          listing={taking}
          onClose={() => setTaking(null)}
          onConfirm={async () => {
            const listing = taking;
            setTaking(null);
            await order.run({
              kind: "cancel",
              input: { listingId: listing.id },
              summary:
                listing.tokenId !== null ? (
                  <>
                    Take {listing.item.title} #{listing.tokenId} off sale
                  </>
                ) : (
                  <>
                    Take back {listing.left} × {listing.item.title}
                  </>
                ),
              done:
                listing.tokenId !== null
                  ? { title: "Off sale", body: "The copy is still yours; it just isn't for sale." }
                  : { title: "Taken back", body: "The unsold copies are back in your wallet." },
            });
          }}
        />
      )}
      {order.step && (
        <ToastViewport>
          <TransactionToast
            key={order.step.kind}
            step={order.step}
            onSend={order.send}
            onCancel={order.stop}
          />
        </ToastViewport>
      )}
    </>
  );
}

function ListingRow({
  listing,
  busy,
  onPrice,
  onTakeBack,
}: {
  listing: Listing;
  busy: boolean;
  onPrice: () => void;
  onTakeBack: () => void;
}) {
  const live = listing.status === "ACTIVE";
  return (
    <div className="bg-surface grid gap-3 rounded-xl border p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
      <img src={listing.item.coverUrl} alt="" className="size-16 rounded-lg object-cover" />
      <div className="min-w-0">
        <Link
          href={`/item/${listing.item.slug}`}
          className="block truncate font-semibold hover:underline"
        >
          {listing.item.title}
        </Link>
        <p className="text-fg-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <Money amount={listing.priceActionToken} currency="ACTION" />
          <Money amount={listing.priceUsd} currency="USD" />
          <span>
            {listing.tokenId !== null
              ? `Copy #${listing.tokenId}`
              : `${listing.left} left · ${listing.sold} sold of ${listing.listed}`}
          </span>
          {!live && (
            <Badge variant="secondary">
              {listing.status === "SOLD_OUT" ? "Sold out" : "Ended"}
            </Badge>
          )}
        </p>
      </div>
      {live && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onPrice} disabled={busy}>
            Change price
          </Button>
          <Button variant="outline" size="sm" onClick={onTakeBack} disabled={busy}>
            {listing.tokenId !== null ? "Take off sale" : "Take back"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PriceDialog({
  listing,
  onClose,
  onRelist,
}: {
  listing: Listing;
  onClose: () => void;
  /** A smart-contract NFT's price is changed on the network: a transaction to sign */
  onRelist: (prices: { priceActionToken: string; priceUsd: string }) => void;
}) {
  const utils = api.useUtils();
  const [actionToken, setActionToken] = useState(listing.priceActionToken);
  const [usd, setUsd] = useState(listing.priceUsd);
  const save = api.resale.setPrice.useMutation({
    onSuccess: async () => {
      await utils.resale.mine.invalidate();
      toast.success("Price changed");
      onClose();
    },
    onError: (error) => toast.error(isAppError(error) ? error.message : error.message),
  });
  const valid = PRICE.test(actionToken.trim()) && PRICE.test(usd.trim());
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="display">Change the price</DialogTitle>
          <DialogDescription>
            {listing.tokenId !== null
              ? `${listing.item.title}, copy #${listing.tokenId}: the new price is put on the network, so you sign a transaction.`
              : `${listing.item.title}: the ${listing.left} unsold copies. Nothing moves on the network, so it's instant.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="price-actionToken">Price each, ACTION</Label>
            <Input
              id="price-actionToken"
              inputMode="decimal"
              value={actionToken}
              onChange={(event) => setActionToken(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="price-usd">Price each, USD (card)</Label>
            <Input
              id="price-usd"
              inputMode="decimal"
              value={usd}
              onChange={(event) => setUsd(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() =>
              listing.tokenId !== null
                ? onRelist({ priceActionToken: actionToken.trim(), priceUsd: usd.trim() })
                : save.mutate({
                    listingId: listing.id,
                    priceActionToken: actionToken.trim(),
                    priceUsd: usd.trim(),
                  })
            }
          >
            Save price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TakeBackDialog({
  listing,
  onClose,
  onConfirm,
}: {
  listing: Listing;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const quote = api.resale.quoteCancel.useQuery({ listingId: listing.id });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="display">
            {listing.tokenId !== null ? "Take it off sale" : "Take back unsold copies"}
          </DialogTitle>
          <DialogDescription>
            {listing.tokenId !== null
              ? `${listing.item.title}, copy #${listing.tokenId}: it stays in your wallet and stops being for sale.`
              : `${listing.item.title}: ${quote.data ? quote.data.copies : listing.left} copies go back to your wallet and the listing ends. Copies already sold stay sold.`}
          </DialogDescription>
        </DialogHeader>
        {quote.data && quote.data.lines.length > 0 && (
          <p className="text-fg-muted text-sm">
            Network fee: <Money amount={quote.data.total} currency="XLM" />
          </p>
        )}
        {quote.data?.problems.map((problem) => (
          <p key={problem.message} role="alert" className="text-danger text-sm">
            {problem.message}
          </p>
        ))}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep it listed
          </Button>
          <Button disabled={!quote.data?.ok} onClick={onConfirm}>
            Take back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
