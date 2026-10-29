"use client";

import { Coins, Eye, ImageIcon, Loader2, Type } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import {
  Field,
  FormPage,
  FormSection,
  MoreOptions,
  OptionList,
  SwitchRow,
} from "@bandcoin/ui/patterns/form-page";
import { assetCodeFrom, normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";

import { DeleteCard } from "~/components/delete-card";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";

import { FileField, type PickedFile } from "./file-field";
import { Note, PriceFields, priceProblems, Toggle } from "./form-parts";
import { RegisterNft } from "./register-nft";
import { acceptFor, fileRequired, ITEM_TYPES, type ItemKind, mediaTypeFor } from "./item-types";

type Existing = RouterOutputs["catalog"]["get"];

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

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
  const [cover, setCover] = useState<PickedFile | null>(
    existing ? { url: existing.coverUrl, name: "cover", mime: "image/jpeg" } : null,
  );
  const [file, setFile] = useState<PickedFile | null>(
    existing?.fileUrl ? { url: existing.fileUrl, name: "File", mime: "" } : null,
  );
  const [code, setCode] = useState(existing?.code ?? "");
  const [customCode, setCustomCode] = useState(editing);
  const [limited, setLimited] = useState(existing ? existing.supply !== null : true);
  const [supply, setSupply] = useState(existing?.supply?.toString() ?? "100");
  const [priceBandcoin, setPriceBandcoin] = useState(existing?.priceBandcoin ?? "");
  const [priceUsd, setPriceUsd] = useState(existing?.priceUsd ?? "");
  const [royalty, setRoyalty] = useState(existing?.royaltyPercent ?? "");
  const [resale, setResale] = useState(existing?.resaleRoyaltyPercent ?? "5");
  const [publish, setPublish] = useState(existing ? existing.visibility === "PUBLIC" : true);
  const [imageBrief, setImageBrief] = useState("");

  const kinds = nft ? ITEM_TYPES.filter((entry) => entry.value !== "ROYALTY") : ITEM_TYPES;
  const shownCode = customCode ? code : assetCodeFrom(title);
  const problems = {
    code: !nft && shownCode ? validateAssetCode(shownCode) : null,
    ...priceProblems(priceBandcoin, priceUsd),
  };
  const supplyNumber = Number(supply);
  const supplyOk =
    (!limited && !nft) ||
    (Number.isInteger(supplyNumber) &&
      supplyNumber >= 1 &&
      supplyNumber <= (nft ? 100_000 : Infinity));
  const royaltyOk = type !== "ROYALTY" || (Number(royalty) > 0 && Number(royalty) <= 100);
  const resaleOk = !nft || (resale !== "" && Number(resale) >= 0 && Number(resale) <= 90);
  const ready =
    title.trim().length > 0 &&
    cover !== null &&
    (!fileRequired(type) || file !== null) &&
    (nft || (shownCode.length > 0 && !problems.code)) &&
    priceBandcoin !== "" &&
    !problems.bandcoin &&
    priceUsd !== "" &&
    !problems.usd &&
    supplyOk &&
    (type !== "ROYALTY" || limited) &&
    royaltyOk &&
    resaleOk;

  const done = (message: string, to = "/items") => {
    toast.success(message);
    void utils.catalog.list.invalidate();
    router.push(to);
  };
  const create = api.catalog.create.useMutation({
    onSuccess: () => done("Item created"),
    onError: (error) => toast.error(messageOf(error)),
  });
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
  const remove = api.catalog.remove.useMutation({
    onSuccess: () => done("Item deleted"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || createNft.isPending || update.isPending;
  const kindLabel = ITEM_TYPES.find((entry) => entry.value === type)?.label ?? type;
  const aiContext = { kind: kindLabel, title, description, code: nft ? "" : shownCode };
  const imagePrompt = imageBrief || [title, description.slice(0, 400)].filter(Boolean).join(". ");

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
        ...(locked
          ? {}
          : { supply: limited || nft ? supplyNumber : null, ...(nft ? {} : { code: shownCode }) }),
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

  const actions = frozen ? (
    <Button asChild type="button" variant="ghost">
      <Link href="/items">Back to items</Link>
    </Button>
  ) : (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href="/items">Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {editing ? "Save changes" : nft ? "Save draft" : "Create item"}
      </Button>
    </>
  );

  const deleteDescription = existing
    ? existing.registered === "MINTED"
      ? "A registered NFT is on the contract, so it can't be deleted."
      : existing.locked
        ? "This item has sales, so it can't be deleted. Hide it by unpublishing instead."
        : "It disappears from your page. This can't be undone."
    : "";

  return (
    <FormPage
      title={existing ? existing.title : "New item"}
      eyebrow="Catalog"
      description={
        existing
          ? undefined
          : "Set what it is, what it costs and how many copies exist. You can edit most of it later."
      }
      back={{ href: "/items", label: "Items" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <section className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="aspect-square w-full object-cover" />
            )}
            <div className="grid gap-2 p-5">
              <p className="text-primary-text text-xs font-semibold tracking-wide uppercase">
                Preview
              </p>
              <p className="display text-xl leading-snug">{title || "Untitled item"}</p>
              <p className="text-fg-muted text-sm">
                {kindLabel} · {nft ? "Contract NFT" : shownCode || "Classic token"}
              </p>
              <p className="num text-sm">
                {priceBandcoin || "…"} BANDCOIN · ${priceUsd || "…"}
              </p>
            </div>
          </section>
          {existing && (
            <DeleteCard
              title="Delete this item"
              confirmTitle={`Delete ${existing.title}?`}
              description={deleteDescription}
              busy={remove.isPending}
              onDelete={() => remove.mutate({ itemId: existing.id })}
            />
          )}
        </>
      }
    >
      {existing?.chain === "CONTRACT_NFT" && existing.registered === "PENDING" && (
        <RegisterNft itemId={existing.id} />
      )}

      {frozen && (
        <p
          role="note"
          className="bg-surface border-fg/10 text-fg-muted rounded-[1.4rem] border-2 p-4 text-sm"
        >
          This NFT is registered on the contract, so its details are fixed for now. Editing
          registered NFTs is coming.
        </p>
      )}

      <fieldset disabled={frozen} className="grid min-w-0 gap-5 border-0 p-0">
        {!editing && (
          <AiFillCard
            form="item"
            context={aiContext}
            examples={[
              "A limited run of 50 signed posters from the tour, $20",
              "A digital copy of my new album art, unlimited copies",
              "Behind-the-scenes video from the studio",
            ]}
            apply={(result) => {
              const before = {
                title,
                description,
                code,
                customCode,
                limited,
                supply,
                priceBandcoin,
                priceUsd,
                imageBrief,
              };
              setTitle(result.title);
              setDescription(result.description);
              if (!nft) {
                setCode(normalizeAssetCode(result.code));
                setCustomCode(true);
              }
              if (result.supply) {
                setLimited(true);
                setSupply(String(result.supply));
              } else if (!nft) setLimited(false);
              if (result.priceBandcoin !== null) setPriceBandcoin(String(result.priceBandcoin));
              if (result.priceUsd !== null) setPriceUsd(String(result.priceUsd));
              setImageBrief(result.imagePrompt);
              return () => {
                setTitle(before.title);
                setDescription(before.description);
                setCode(before.code);
                setCustomCode(before.customCode);
                setLimited(before.limited);
                setSupply(before.supply);
                setPriceBandcoin(before.priceBandcoin);
                setPriceUsd(before.priceUsd);
                setImageBrief(before.imageBrief);
              };
            }}
          />
        )}

        <FormSection title="The item" icon={Type}>
          <Field
            label="What are you selling?"
            htmlFor="item-type"
            required
            hint={editing ? "The kind can't change after an item is created." : undefined}
          >
            <Select
              value={type}
              disabled={editing}
              onValueChange={(value) => setType(value as ItemKind)}
            >
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
          </Field>

          <Field
            label="Title"
            htmlFor="item-title"
            required
            action={
              <AiTextButton
                form="item"
                field="title"
                maxChars={nft ? 128 : 120}
                value={title}
                context={aiContext}
                onChange={setTitle}
              />
            }
          >
            <Input
              id="item-title"
              value={title}
              maxLength={nft ? 128 : 120}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="item-description"
            action={
              <AiTextButton
                form="item"
                field="description"
                maxChars={2000}
                value={description}
                context={aiContext}
                onChange={setDescription}
              />
            }
          >
            <Textarea
              id="item-description"
              value={description}
              maxLength={2000}
              rows={5}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </FormSection>

        <FormSection title="Pictures and files" icon={ImageIcon}>
          <Field label="Cover picture" htmlFor="item-cover" required>
            <FileField
              id="item-cover"
              accept={IMAGE_TYPES}
              value={cover}
              onChange={setCover}
              preview
              hint="Shown on cards and the item page. JPG, PNG, WebP or GIF."
            />
            {!frozen && (
              <AiImagePanel
                form="item"
                aspect="square"
                suggestedPrompt={imagePrompt}
                onImage={(url) => setCover({ url, name: "cover", mime: "image/png" })}
              />
            )}
          </Field>
          <Field
            label={fileRequired(type) ? "The file people get" : "A file to include (optional)"}
            htmlFor="item-file"
            required={fileRequired(type)}
          >
            <FileField
              id="item-file"
              accept={acceptFor(type)}
              value={file}
              onChange={setFile}
              hint={
                editing
                  ? "The file can't be swapped after the item is created."
                  : "Only owners can open it."
              }
              key={type}
            />
          </Field>
        </FormSection>

        <FormSection title="Price and copies" icon={Coins}>
          {type === "ROYALTY" && (
            <Field label="Share of your revenue holders split (%)" htmlFor="item-royalty" required>
              <Input
                id="item-royalty"
                inputMode="decimal"
                value={royalty}
                disabled={editing}
                onChange={(event) => setRoyalty(event.target.value)}
                className="max-w-32"
              />
            </Field>
          )}

          <PriceFields
            bandcoin={priceBandcoin}
            usd={priceUsd}
            onBandcoin={setPriceBandcoin}
            onUsd={setPriceUsd}
            idPrefix="item-price"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Copies"
              htmlFor="item-supply"
              hint={
                locked
                  ? `${existing?.sold} sold, so the number of copies is fixed.`
                  : nft
                    ? "An NFT edition has a fixed number of copies, up to 100,000."
                    : type === "ROYALTY"
                      ? "Holders get their share of all the copies, so the number is fixed."
                      : undefined
              }
            >
              <div className="flex items-center gap-2">
                <Toggle pressed={limited || nft} disabled={locked} onClick={() => setLimited(true)}>
                  {nft ? "Fixed" : "Limited"}
                </Toggle>
                {!nft && type !== "ROYALTY" && (
                  <Toggle pressed={!limited} disabled={locked} onClick={() => setLimited(false)}>
                    Unlimited
                  </Toggle>
                )}
                {(limited || nft) && (
                  <Input
                    id="item-supply"
                    inputMode="numeric"
                    value={supply}
                    disabled={locked}
                    aria-label="Number of copies"
                    onChange={(event) => setSupply(event.target.value.replace(/\D/g, ""))}
                    className="w-24"
                  />
                )}
              </div>
            </Field>
          </div>
        </FormSection>

        <MoreOptions
          title="Token settings"
          hint="The token type and its code on Stellar. The defaults suit most items."
          open={Boolean(problems.code) || !resaleOk}
        >
          {!editing && (
            <Field label="What kind of token?" htmlFor="item-chain">
              <div className="flex flex-wrap gap-2" id="item-chain">
                <Toggle pressed={!nft} onClick={() => setNft(false)}>
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

          <div className="grid gap-5 sm:grid-cols-2">
            {nft ? (
              <Field
                label="Royalty on resales (%)"
                htmlFor="item-resale"
                hint="What you earn each time a fan resells a copy, from 0 to 90. Fixed once registered."
              >
                <Input
                  id="item-resale"
                  inputMode="decimal"
                  value={resale}
                  aria-invalid={!resaleOk}
                  onChange={(event) => setResale(event.target.value.trim())}
                  className="max-w-32"
                />
              </Field>
            ) : (
              <Field
                label="Asset code"
                htmlFor="item-code"
                required
                error={problems.code}
                hint={
                  locked
                    ? "Fixed after the first sale."
                    : "The short name of the token on Stellar, up to 12 letters and numbers."
                }
              >
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
              </Field>
            )}
          </div>
        </MoreOptions>

        <FormSection title="Visibility" icon={Eye}>
          {nft ? (
            <p role="note" className="bg-surface-2 text-fg-muted rounded-md p-3 text-[13px]">
              <b>Draft for now.</b> After you register it, selling contract NFTs to fans opens soon,
              and then you can publish.
            </p>
          ) : (
            <OptionList>
              <SwitchRow
                icon={Eye}
                title={publish ? "Published" : "Draft"}
                hint={publish ? "Fans can buy it." : "Only you can see it."}
                checked={publish}
                onChange={setPublish}
              />
            </OptionList>
          )}
        </FormSection>
      </fieldset>
    </FormPage>
  );
}
