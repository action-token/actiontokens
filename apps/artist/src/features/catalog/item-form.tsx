"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { cn } from "@bandcoin/ui/lib/cn";
import { normalizeAssetCode, validateAssetCode, validatePrice } from "@bandcoin/utils/asset-code";

import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "./file-field";
import { acceptFor, fileRequired, ITEM_TYPES, type ItemKind, mediaTypeFor } from "./item-types";

type Existing = RouterOutputs["catalog"]["get"];

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** A code suggestion from the title: letters and numbers only, up to 12. */
const codeFrom = (title: string) => normalizeAssetCode(title.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "")).slice(0, 12);

/**
 * One form for a new item and for editing one. Editing can't change the kind,
 * and once a copy has sold the supply and code are fixed (the server enforces
 * it too). Prices are set separately in BANDCOIN and USD: nothing converts one
 * into the other.
 */
export function ItemForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const editing = Boolean(existing);
  const locked = existing?.locked ?? false;

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
  const [publish, setPublish] = useState(existing ? existing.visibility === "PUBLIC" : true);

  const shownCode = customCode ? code : codeFrom(title);
  const problems = {
    code: shownCode ? validateAssetCode(shownCode) : null,
    bandcoin: priceBandcoin ? validatePrice(priceBandcoin) : null,
    usd: priceUsd ? validatePrice(priceUsd) : null,
  };
  const supplyNumber = Number(supply);
  const supplyOk = !limited || (Number.isInteger(supplyNumber) && supplyNumber >= 1);
  const royaltyOk = type !== "ROYALTY" || (Number(royalty) > 0 && Number(royalty) <= 100);
  const ready =
    title.trim().length > 0 &&
    cover !== null &&
    (!fileRequired(type) || file !== null) &&
    shownCode.length > 0 && !problems.code &&
    priceBandcoin !== "" && !problems.bandcoin &&
    priceUsd !== "" && !problems.usd &&
    supplyOk &&
    royaltyOk;

  const done = (message: string) => {
    toast.success(message);
    void utils.catalog.list.invalidate();
    router.push("/items");
  };
  const create = api.catalog.create.useMutation({ onSuccess: () => done("Item created"), onError: (error) => toast.error(messageOf(error)) });
  const update = api.catalog.update.useMutation({
    onSuccess: () => {
      void utils.catalog.get.invalidate();
      done("Saved");
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !cover) return;
    const visibility = publish ? ("PUBLIC" as const) : ("DRAFT" as const);
    if (existing) {
      update.mutate({
        itemId: existing.id,
        title,
        description,
        coverUrl: cover.url,
        priceBandcoin,
        priceUsd,
        visibility,
        ...(locked ? {} : { supply: limited ? supplyNumber : null, code: shownCode }),
      });
      return;
    }
    create.mutate({
      type,
      title,
      description: description || undefined,
      coverUrl: cover.url,
      media: file ? { url: file.url, mediaType: mediaTypeFor(file.mime, type) } : undefined,
      code: shownCode,
      supply: limited ? supplyNumber : null,
      priceBandcoin,
      priceUsd,
      visibility,
      royaltyPercent: type === "ROYALTY" ? royalty : undefined,
    });
  }

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-2xl gap-6 rounded-xl border p-5 sm:p-6">
      <Field label="What are you selling?" htmlFor="item-type">
        <Select value={type} disabled={editing} onValueChange={(value) => setType(value as ItemKind)}>
          <SelectTrigger id="item-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_TYPES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label} <span className="text-fg-faint">· {entry.hint}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editing && <Note>The kind can&apos;t change after an item is created.</Note>}
      </Field>

      <Field label="Title" htmlFor="item-title">
        <Input id="item-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Price in BANDCOIN" htmlFor="item-price-bandcoin" error={problems.bandcoin}>
          <Input id="item-price-bandcoin" inputMode="decimal" value={priceBandcoin} aria-invalid={Boolean(problems.bandcoin)} onChange={(event) => setPriceBandcoin(event.target.value.trim())} />
        </Field>
        <Field label="Price in USD (card price)" htmlFor="item-price-usd" error={problems.usd}>
          <Input id="item-price-usd" inputMode="decimal" value={priceUsd} aria-invalid={Boolean(problems.usd)} onChange={(event) => setPriceUsd(event.target.value.trim())} />
        </Field>
        <p className="text-fg-faint text-xs sm:col-span-2">You set both prices yourself. Nothing is converted between them.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Copies" htmlFor="item-supply">
          <div className="flex items-center gap-2">
            <Toggle pressed={limited} disabled={locked} onClick={() => setLimited(true)}>Limited</Toggle>
            <Toggle pressed={!limited} disabled={locked} onClick={() => setLimited(false)}>Unlimited</Toggle>
            {limited && (
              <Input id="item-supply" inputMode="numeric" value={supply} disabled={locked} aria-label="Number of copies" onChange={(event) => setSupply(event.target.value.replace(/\D/g, ""))} className="w-24" />
            )}
          </div>
          {locked && <Note>{existing?.sold} sold, so the number of copies is fixed.</Note>}
        </Field>
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
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="size-4" />
        <span>
          <b>{publish ? "Published" : "Draft"}</b> <span className="text-fg-muted">· {publish ? "fans can buy it" : "only you can see it"}</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Create item"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/items")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="text-fg-faint text-xs">{children}</p>;

function Toggle({ pressed, disabled, onClick, children }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60",
        pressed ? "bg-primary text-primary-foreground border-fg" : "text-fg-muted hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
