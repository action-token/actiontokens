"use client";

import { Loader2, Package } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";
import { Field } from "@actiontokens/ui/patterns/form-page";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { api, type RouterOutputs } from "~/trpc/react";

import { type OfferDraft, offerProblems } from "./offer-checks";

type Offer = RouterOutputs["catalog"]["pageAssets"]["offers"][number];

const EMPTY: OfferDraft = { amount: "", priceBandcoin: "", priceUsd: "", priceXlm: "", note: "" };
const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/**
 * Sell Page Assets, as on the old Bandcoin: a bundle of your fan token from
 * storage, sold whole to the first fan who buys it. Fans see open offers on
 * your page.
 */
export function PageAssets() {
  const overview = api.catalog.pageAssets.useQuery();
  if (overview.isPending) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!overview.data?.fanToken) return null;
  const { fanToken, storageOpen, held, free, offers } = overview.data;

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="display text-2xl">Sell page assets</h2>
        <p className="text-fg-muted text-sm">
          Sell a bundle of {fanToken.code} from your storage. The first fan to buy it gets all of
          it.
        </p>
      </div>
      {!storageOpen ? (
        <p className="bg-surface text-fg-muted rounded-xl border p-4 text-sm">
          Open your storage account under{" "}
          <Link href="/settings" className="text-primary-text underline-offset-2 hover:underline">
            Settings
          </Link>{" "}
          and move {fanToken.code} into it, then come back to sell bundles.
        </p>
      ) : held === null ? (
        <p className="bg-surface text-fg-muted rounded-xl border p-4 text-sm">
          Couldn&apos;t read your storage on Stellar just now. Reload the page in a moment.
        </p>
      ) : (
        <>
          <p className="text-fg-muted text-sm">
            Storage holds <b className="num text-fg">{tokens(held ?? "0")}</b> {fanToken.code};{" "}
            <b className="num text-fg">{tokens(free ?? "0")}</b> can still be offered.
          </p>
          <NewOffer code={fanToken.code} free={free} />
        </>
      )}
      {offers.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {offers.map((offer) => (
            <OfferRow key={offer.id} offer={offer} code={fanToken.code} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewOffer({ code, free }: { code: string; free: string | null }) {
  const utils = api.useUtils();
  const [draft, setDraft] = useState<OfferDraft>(EMPTY);
  const { problems, ready } = offerProblems(draft, free);
  const create = api.catalog.createPageAsset.useMutation({
    onSuccess: () => {
      toast.success("Your offer is on sale");
      setDraft(EMPTY);
      void utils.catalog.pageAssets.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const set = (key: keyof OfferDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    create.mutate({
      amount: draft.amount.trim(),
      priceBandcoin: draft.priceBandcoin.trim(),
      priceUsd: draft.priceUsd.trim(),
      priceXlm: draft.priceXlm.trim(),
      note: draft.note.trim() || undefined,
    });
  }

  const price = (key: "priceBandcoin" | "priceUsd" | "priceXlm", label: string) => (
    <Field label={label} htmlFor={`offer-${key}`} required error={problems[key]}>
      <Input
        id={`offer-${key}`}
        inputMode="decimal"
        value={draft[key]}
        aria-invalid={Boolean(problems[key])}
        onChange={(event) => set(key)(event.target.value)}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="bg-surface grid gap-4 rounded-xl border p-4">
      <Field
        label={`How many ${code}`}
        htmlFor="offer-amount"
        required
        error={problems.amount}
        hint="All of it goes to the one fan who buys the offer."
      >
        <Input
          id="offer-amount"
          inputMode="decimal"
          value={draft.amount}
          aria-invalid={Boolean(problems.amount)}
          className="max-w-48"
          onChange={(event) => set("amount")(event.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {price("priceBandcoin", "Price in BANDCOIN")}
        {price("priceUsd", "Price in USD")}
        {price("priceXlm", "Price in XLM")}
      </div>
      <Field label="Description" htmlFor="offer-note" error={problems.note}>
        <Textarea
          id="offer-note"
          rows={2}
          value={draft.note}
          placeholder="What it's for, e.g. enough to reach the Gold tier"
          onChange={(event) => set("note")(event.target.value)}
        />
      </Field>
      <Button type="submit" className="justify-self-start" disabled={!ready || create.isPending}>
        {create.isPending ? <Loader2 className="animate-spin" /> : <Package />} Put on sale
      </Button>
    </form>
  );
}

function OfferRow({ offer, code }: { offer: Offer; code: string }) {
  const utils = api.useUtils();
  const [confirming, setConfirming] = useState(false);
  const close = api.catalog.closePageAsset.useMutation({
    onSuccess: () => {
      setConfirming(false);
      toast.success("Offer taken down");
      void utils.catalog.pageAssets.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="num">{tokens(offer.amount)}</span> {code}
        </p>
        <p className="text-fg-muted num text-xs">
          {tokens(offer.priceBandcoin)} BANDCOIN · ${tokens(offer.priceUsd)}
          {offer.priceXlm && ` · ${tokens(offer.priceXlm)} XLM`}
        </p>
        {offer.note && <p className="text-fg-muted mt-1 text-xs">{offer.note}</p>}
      </div>
      {offer.sold ? (
        <StatusPill tone="neutral">Sold</StatusPill>
      ) : (
        <>
          <StatusPill tone="success">On sale</StatusPill>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Take down
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Take this offer down?"
            description="Fans won't see it any more. The tokens stay in your storage."
            confirmLabel="Take down"
            busy={close.isPending}
            onConfirm={() => close.mutate({ offerId: offer.id })}
          />
        </>
      )}
    </li>
  );
}
