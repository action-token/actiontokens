"use client";

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@bandcoin/ui/components/dialog";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { validatePrice } from "@bandcoin/utils/asset-code";

import { api, type RouterOutputs } from "~/trpc/react";

import { Field, Note } from "../catalog/form-parts";

type Tier = RouterOutputs["memberships"]["tiers"][number];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** Create or edit one tier: its name, how many fan tokens it needs, and the perks it gives. */
export function TierDialog({ tier, tokenCode, open, onOpenChange }: { tier?: Tier; tokenCode: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = api.useUtils();
  const [name, setName] = useState(tier?.name ?? "");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [required, setRequired] = useState(tier?.requiredTokens ?? "");
  const [perks, setPerks] = useState(tier?.features.join("\n") ?? "");
  const [popular, setPopular] = useState(tier?.isPopular ?? false);

  const done = (message: string) => {
    toast.success(message);
    void utils.memberships.tiers.invalidate();
    onOpenChange(false);
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
    if (tier) update.mutate({ tierId: tier.id, ...fields });
    else create.mutate(fields);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{tier ? `Edit ${tier.name}` : "New tier"}</DialogTitle>
            <DialogDescription>Fans are in this tier while they hold enough {tokenCode}.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="tier-name">
            <Input id="tier-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={`${tokenCode} a fan must hold`} htmlFor="tier-required" error={problem}>
            <Input id="tier-required" inputMode="decimal" value={required} aria-invalid={Boolean(problem)} onChange={(event) => setRequired(event.target.value.trim())} className="max-w-40" />
          </Field>
          <Field label="Short description" htmlFor="tier-description">
            <Input id="tier-description" value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Perks, one per line" htmlFor="tier-perks">
            <Textarea id="tier-perks" value={perks} rows={4} placeholder={"Early access to drops\nMembers-only posts"} onChange={(event) => setPerks(event.target.value)} />
            <Note>Up to 10.</Note>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={popular} onChange={(event) => setPopular(event.target.checked)} className="size-4" />
            Mark as the popular tier
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {tier ? "Save" : "Create tier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
