"use client";

import { Crown, Loader2, Type } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";
import {
  Field,
  FormPage,
  FormSection,
  OptionList,
  SwitchRow,
} from "@bandcoin/ui/patterns/form-page";
import { validatePrice } from "@bandcoin/utils/asset-code";

import { DeleteCard } from "~/components/delete-card";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiTextButton } from "../ai/ai-text-button";
import { Note } from "../catalog/form-parts";

type Existing = RouterOutputs["memberships"]["tiers"][number];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** One form for a new tier and for editing one: its name, how many fan tokens it needs, and the perks it gives. */
export function TierForm({ existing, tokenCode }: { existing?: Existing; tokenCode: string }) {
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
  const create = api.memberships.createTier.useMutation({
    onSuccess: () => done("Tier created"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.memberships.updateTier.useMutation({
    onSuccess: () => done("Saved"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.memberships.removeTier.useMutation({
    onSuccess: () => done("Tier deleted"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;

  const problem = required ? validatePrice(required) : null;
  const ready = name.trim().length > 0 && required !== "" && !problem;
  const aiContext = { name, description, perks, tokensNeeded: required, token: tokenCode };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const fields = {
      name,
      description,
      requiredTokens: required,
      features: perks.split("\n"),
      isPopular: popular,
    };
    if (existing) update.mutate({ tierId: existing.id, ...fields });
    else create.mutate(fields);
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href="/memberships">Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Create tier"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.name : "New tier"}
      eyebrow="Fans"
      description="Fans are in a tier while they hold enough of your fan token."
      back={{ href: "/memberships", label: "Memberships" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <section className="bg-surface border-fg/10 grid gap-2 rounded-[1.4rem] border-2 p-5">
            <p className="text-primary-text text-xs font-semibold tracking-wide uppercase">
              Preview
            </p>
            <p className="display text-xl">{name || "Tier name"}</p>
            <p className="text-fg-muted text-sm">
              Hold <span className="num font-semibold">{required || "…"}</span> {tokenCode}
            </p>
            {description && <p className="text-sm">{description}</p>}
            <ul className="text-fg-muted grid gap-0.5 text-sm">
              {perks
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((perk) => (
                  <li key={perk}>· {perk}</li>
                ))}
            </ul>
          </section>
          {existing && (
            <DeleteCard
              title="Delete this tier"
              confirmTitle={`Delete ${existing.name}?`}
              description={
                existing.inUse > 0
                  ? `${existing.inUse} items, posts or pins use this tier, so it can't be deleted. Hide it instead.`
                  : "This can't be undone."
              }
              busy={remove.isPending}
              onDelete={() => remove.mutate({ tierId: existing.id })}
            />
          )}
        </>
      }
    >
      {!existing && (
        <AiFillCard
          form="tier"
          context={aiContext}
          examples={[
            "A supporter tier for the first 10 tokens with early access",
            "A VIP tier with signed merch and backstage passes",
          ]}
          apply={(result) => {
            const before = { name, description, perks, popular };
            setName(result.name);
            setDescription(result.description);
            setPerks(result.features.join("\n"));
            setPopular(result.isPopular);
            return () => {
              setName(before.name);
              setDescription(before.description);
              setPerks(before.perks);
              setPopular(before.popular);
            };
          }}
        />
      )}

      <FormSection title="The tier" icon={Type}>
        <Field
          label="Name"
          htmlFor="tier-name"
          required
          action={
            <AiTextButton
              form="tier"
              field="name"
              maxChars={40}
              value={name}
              context={aiContext}
              onChange={setName}
            />
          }
        >
          <Input
            id="tier-name"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="Short description"
          htmlFor="tier-description"
          action={
            <AiTextButton
              form="tier"
              field="description"
              maxChars={300}
              value={description}
              context={aiContext}
              onChange={setDescription}
            />
          }
        >
          <Input
            id="tier-description"
            value={description}
            maxLength={300}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Perks, one per line" htmlFor="tier-perks" hint="Up to 10.">
          <Textarea
            id="tier-perks"
            value={perks}
            rows={5}
            placeholder={"Early access to drops\nMembers-only posts"}
            onChange={(event) => setPerks(event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Who gets it" icon={Crown}>
        <Field
          label={`${tokenCode} a fan must hold`}
          htmlFor="tier-required"
          required
          error={problem}
        >
          <Input
            id="tier-required"
            inputMode="decimal"
            value={required}
            aria-invalid={Boolean(problem)}
            onChange={(event) => setRequired(event.target.value.trim())}
            className="max-w-40"
          />
          <Note>Fans are in this tier while they hold at least this many {tokenCode}.</Note>
        </Field>
        <OptionList>
          <SwitchRow
            icon={Crown}
            title="Popular tier"
            hint="Marks this tier as the one to pick."
            checked={popular}
            onChange={setPopular}
          />
        </OptionList>
      </FormSection>
    </FormPage>
  );
}
