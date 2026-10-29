"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { validatePrice } from "@bandcoin/utils/asset-code";

import { api, type RouterOutputs } from "~/trpc/react";

import { Field, Note } from "../catalog/form-parts";

type Tier = RouterOutputs["memberships"]["tiers"][number];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** One form for a new tier and for editing one: its name, how many fan tokens it needs, and the perks it gives. */
export function TierForm({ existing, tokenCode }: { existing?: Tier; tokenCode: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [required, setRequired] = useState(existing?.requiredTokens ?? "");
  const [perks, setPerks] = useState(existing?.features.join("\n") ?? "");
  const [popular, setPopular] = useState(existing?.isPopular ?? false);

  const done = (message: string) => {
    toast.success(message);
    void utils.memberships.tiers.invalidate();
    router.push("/memberships");
  };
  const create = api.memberships.createTier.useMutation({ onSuccess: () => done("Tier created"), onError: (error) => toast.error(messageOf(error)) });
  const update = api.memberships.updateTier.useMutation({ onSuccess: () => done("Saved"), onError: (error) => toast.error(messageOf(error)) });
  const saving = create.isPending || update.isPending;

  const problem = required ? validatePrice(required) : null;
  const ready = name.trim().length > 0 && required !== "" && !problem;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const fields = { name, description, requiredTokens: required, features: perks.split("\n"), isPopular: popular };
    if (existing) update.mutate({ tierId: existing.id, ...fields });
    else create.mutate(fields);
  }

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-2xl gap-6 rounded-xl border p-5 sm:p-6">
      <Field label="Name" htmlFor="tier-name">
        <Input id="tier-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={`${tokenCode} a fan must hold`} htmlFor="tier-required" error={problem}>
        <Input id="tier-required" inputMode="decimal" value={required} aria-invalid={Boolean(problem)} onChange={(event) => setRequired(event.target.value.trim())} className="max-w-40" />
        <Note>Fans are in this tier while they hold at least this many {tokenCode}.</Note>
      </Field>
      <Field label="Short description" htmlFor="tier-description">
        <Input id="tier-description" value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label="Perks, one per line" htmlFor="tier-perks">
        <Textarea id="tier-perks" value={perks} rows={5} placeholder={"Early access to drops\nMembers-only posts"} onChange={(event) => setPerks(event.target.value)} />
        <Note>Up to 10.</Note>
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={popular} onChange={(event) => setPopular(event.target.checked)} className="size-4" />
        Mark as the popular tier
      </label>
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {existing ? "Save changes" : "Create tier"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/memberships">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
