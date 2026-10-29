"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { assetCodeFrom, normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";

import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "./file-field";
import { Field, Note, PriceFields, priceProblems, Toggle } from "./form-parts";
import { acceptFor, fileRequired, ITEM_TYPES, type ItemKind, mediaTypeFor } from "./item-types";

type Existing = RouterOutputs["catalog"]["get"];

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/**
 * One form for a new item and for editing one. Editing can't change the kind,
 * and once a copy has sold the supply and code are fixed (the server enforces
 * it too). Prices are set separately in BANDCOIN and USD: nothing converts one
 * into the other.
 *
 * Two kinds of token: a classic Stellar token (a code, any number of copies, can
 * be published right away) and a contract NFT (a fixed number of numbered
 * copies, saved as a draft and registered on the contract in a second step).
 */
export function ItemForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const editing = Boolean(existing);
  const locked = existing?.locked ?? false;
  /** A registered NFT lives on the contract; changing it takes an on-chain update that isn't built yet */
  const frozen = existing?.registered === "MINTED";

  const [nft, setNft] = useState(existing?.chain === "CONTRACT_NFT");
  const [type, setType] = useState<ItemKind>((existing?.type as ItemKind | undefined) ?? "IMAGE");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(existing ? { url: existing.coverUrl, name: "cover", mime: "image/jpeg" } : null);
  const [file, setFile] = useState<PickedFile | null>(existing?.fileUrl ? { url: existing.fileUrl, name: "File", mime: "" } : null);
  const [code, setCode] = useState(existing?.code ?? "");
  const [customCode, setCustomCode] = useState(editing);
  const [limited, setLimited] = useState(existing ? existing.supply !== null : true);
  const [supply, setSupply] = useState(existing?.supply?.toString() ?? "100");
  const [priceBandcoin, setPriceBandcoin] = useState(existing?.priceBandcoin ?? "");
  const [priceUsd, setPriceUsd] = useState(existing?.priceUsd ?? "");
  const [royalty, setRoyalty] = useState(existing?.royaltyPercent ?? "");
  const [resale, setResale] = useState(existing?.resaleRoyaltyPercent ?? "5");
  const [publish, setPublish] = useState(existing ? existing.visibility === "PUBLIC" : true);

  const kinds = nft ? ITEM_TYPES.filter((entry) => entry.value !== "ROYALTY") : ITEM_TYPES;
  const shownCode = customCode ? code : assetCodeFrom(title);
  const problems = {
    code: !nft && shownCode ? validateAssetCode(shownCode) : null,
    ...priceProblems(priceBandcoin, priceUsd),
  };
  const supplyNumber = Number(supply);
  const supplyOk = (!limited && !nft) || (Number.isInteger(supplyNumber) && supplyNumber >= 1 && supplyNumber <= (nft ? 100_000 : Infinity));
  const royaltyOk = type !== "ROYALTY" || (Number(royalty) > 0 && Number(royalty) <= 100);
  const resaleOk = !nft || (resale !== "" && Number(resale) >= 0 && Number(resale) <= 90);
  const ready =
    title.trim().length > 0 &&
    cover !== null &&
    (!fileRequired(type) || file !== null) &&
    (nft || (shownCode.length > 0 && !problems.code)) &&
    priceBandcoin !== "" && !problems.bandcoin &&
    priceUsd !== "" && !problems.usd &&
    supplyOk &&
    royaltyOk &&
    resaleOk;

  const done = (message: string, to = "/items") => {
    toast.success(message);
    void utils.catalog.list.invalidate();
    router.push(to);
  };
  const create = api.catalog.create.useMutation({ onSuccess: () => done("Item created"), onError: (error) => toast.error(messageOf(error)) });
  const createNft = api.catalog.createNft.useMutation({
    onSuccess: ({ itemId }) => done("Draft saved. One more step: register it.", `/items/${itemId}`),
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.catalog.update.useMutation({
    onSuccess: () => {
      void utils.catalog.get.invalidate();
      done("Saved");
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || createNft.isPending || update.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !cover || frozen) return;
    const visibility = publish && !nft ? ("PUBLIC" as const) : ("DRAFT" as const);
    const media = file ? { url: file.url, mediaType: mediaTypeFor(file.mime, type) } : undefined;
    if (existing) {
      update.mutate({
        itemId: existing.id,
        title,
        description,
        coverUrl: cover.url,
        priceBandcoin,
        priceUsd,
        ...(nft ? {} : { visibility }),
        ...(locked ? {} : { supply: limited || nft ? supplyNumber : null, ...(nft ? {} : { code: shownCode }) }),
      });
    } else if (nft) {
      createNft.mutate({
        type: type as Exclude<ItemKind, "ROYALTY">,
        title,
        description: description || undefined,
        coverUrl: cover.url,
        media,
        supply: supplyNumber,
        priceBandcoin,
        priceUsd,
        resaleRoyaltyPercent: resale,
      });
    } else {
      create.mutate({
        type,
        title,
        description: description || undefined,
        coverUrl: cover.url,
        media,
        code: shownCode,
        supply: limited ? supplyNumber : null,
        priceBandcoin,
        priceUsd,
        visibility,
        royaltyPercent: type === "ROYALTY" ? royalty : undefined,
      });
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface max-w-2xl rounded-xl border p-5 sm:p-6">
      <fieldset disabled={frozen} className="grid min-w-0 gap-6 border-0 p-0">
        {frozen && (
          <p role="note" className="bg-surface-2 text-fg-muted rounded-md p-3 text-[13px]">
            This NFT is registered on the contract, so its details are fixed for now. Editing registered NFTs is coming.
          </p>
        )}

        {!editing && (
          <Field label="What kind of token?" htmlFor="item-chain">
            <div className="flex flex-wrap gap-2" id="item-chain">
              <Toggle
                pressed={!nft}
                onClick={() => {
                  setNft(false);
                }}
              >
                Classic token
              </Toggle>
              <Toggle
                pressed={nft}
                onClick={() => {
                  setNft(true);
                  setLimited(true);
                  if (type === "ROYALTY") setType("IMAGE");
                }}
              >
                Contract NFT
              </Toggle>
            </div>
            <Note>
              {nft
                ? "Numbered copies on a Soroban contract, with a royalty on every resale. Saved as a draft, then registered for a small network fee."
                : "A simple Stellar token under your own account. Free to create, and you can publish it right away."}
            </Note>
          </Field>
        )}

        <Field label="What are you selling?" htmlFor="item-type">
          <Select value={type} disabled={editing} onValueChange={(value) => setType(value as ItemKind)}>
            <SelectTrigger id="item-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label} <span className="text-fg-faint">· {entry.hint}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editing && <Note>The kind can&apos;t change after an item is created.</Note>}
        </Field>

        <Field label="Title" htmlFor="item-title">
          <Input id="item-title" value={title} maxLength={nft ? 128 : 120} onChange={(event) => setTitle(event.target.value)} />
        </Field>

        <Field label="Description (optional)" htmlFor="item-description">
          <Textarea id="item-description" value={description} maxLength={2000} rows={4} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        <Field label="Cover picture" htmlFor="item-cover">
          <FileField id="item-cover" accept={IMAGE_TYPES} value={cover} onChange={setCover} preview hint="Shown on cards and the item page. JPG, PNG, WebP or GIF." />
        </Field>

        <Field label={fileRequired(type) ? "The file people get" : "A file to include (optional)"} htmlFor="item-file">
          <FileField
            id="item-file"
            accept={acceptFor(type)}
            value={file}
            onChange={setFile}
            hint={editing ? "The file can't be swapped after the item is created." : "Only owners can open it."}
            key={type}
          />
        </Field>

        {type === "ROYALTY" && (
          <Field label="Share of your revenue holders split (%)" htmlFor="item-royalty">
            <Input id="item-royalty" inputMode="decimal" value={royalty} disabled={editing} onChange={(event) => setRoyalty(event.target.value)} className="max-w-32" />
          </Field>
        )}

        <PriceFields bandcoin={priceBandcoin} usd={priceUsd} onBandcoin={setPriceBandcoin} onUsd={setPriceUsd} idPrefix="item-price" />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Copies" htmlFor="item-supply">
            <div className="flex items-center gap-2">
              <Toggle pressed={limited || nft} disabled={locked} onClick={() => setLimited(true)}>
                {nft ? "Fixed" : "Limited"}
              </Toggle>
              {!nft && (
                <Toggle pressed={!limited} disabled={locked} onClick={() => setLimited(false)}>
                  Unlimited
                </Toggle>
              )}
              {(limited || nft) && (
                <Input id="item-supply" inputMode="numeric" value={supply} disabled={locked} aria-label="Number of copies" onChange={(event) => setSupply(event.target.value.replace(/\D/g, ""))} className="w-24" />
              )}
            </div>
            {locked && <Note>{existing?.sold} sold, so the number of copies is fixed.</Note>}
            {nft && !locked && <Note>An NFT edition has a fixed number of copies, up to 100,000.</Note>}
          </Field>

          {nft ? (
            <Field label="Royalty on resales (%)" htmlFor="item-resale">
              <Input id="item-resale" inputMode="decimal" value={resale} aria-invalid={!resaleOk} onChange={(event) => setResale(event.target.value.trim())} className="max-w-32" />
              <Note>What you earn each time a fan resells a copy, from 0 to 90. Fixed once registered.</Note>
            </Field>
          ) : (
            <Field label="Asset code" htmlFor="item-code" error={problems.code}>
              <Input
                id="item-code"
                value={shownCode}
                disabled={locked}
                maxLength={12}
                autoComplete="off"
                aria-invalid={Boolean(problems.code)}
                onChange={(event) => {
                  setCustomCode(true);
                  setCode(normalizeAssetCode(event.target.value));
                }}
              />
              <Note>{locked ? "Fixed after the first sale." : "The short name of the token on Stellar, up to 12 letters and numbers."}</Note>
            </Field>
          )}
        </div>

        {nft ? (
          <p role="note" className="bg-surface-2 text-fg-muted rounded-md p-3 text-[13px]">
            <b>Draft for now.</b> After you register it, selling contract NFTs to fans opens soon, and then you can publish.
          </p>
        ) : (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="size-4" />
            <span>
              <b>{publish ? "Published" : "Draft"}</b> <span className="text-fg-muted">· {publish ? "fans can buy it" : "only you can see it"}</span>
            </span>
          </label>
        )}

        {!frozen && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!ready || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : nft ? "Save draft" : "Create item"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/items")}>
              Cancel
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
