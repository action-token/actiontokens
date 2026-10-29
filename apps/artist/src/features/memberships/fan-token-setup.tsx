"use client";

import { Loader2, Sparkles, SquarePen, Link2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";
import { assetCodeFrom, normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";

import { api } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";
import { Field, Note } from "../catalog/form-parts";
import { usePortal } from "../portal/use-portal";

type Mode = "GENERATE" | "CUSTOM" | "EXISTING";

const WAYS: { mode: Mode; icon: typeof Sparkles; title: string; text: string }[] = [
  { mode: "GENERATE", icon: Sparkles, title: "Make one for me", text: "We pick a code from your name. You see it before it's created." },
  { mode: "CUSTOM", icon: SquarePen, title: "Choose my own code", text: "Pick the short name your fans will see, like LUNA." },
  { mode: "EXISTING", icon: Link2, title: "Use a token I already have", text: "Already issued a token on Stellar? Point us at it." },
];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/**
 * Step one of Memberships: the fan token tiers are counted in. Three ways to get
 * one. The code is the token's name on Stellar and can't change, so it is shown
 * before anything is created.
 */
export function FanTokenSetup() {
  const utils = api.useUtils();
  const portal = usePortal();
  const [mode, setMode] = useState<Mode>("GENERATE");
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [cover, setCover] = useState<PickedFile | null>(null);

  const suggestion = assetCodeFrom(portal.artist?.name ?? "") || "FANS";
  const shownCode = mode === "GENERATE" ? suggestion : code;
  const codeProblem = mode !== "GENERATE" && code ? validateAssetCode(code) : null;
  const ready = cover !== null && shownCode.length > 0 && !codeProblem && (mode !== "EXISTING" || issuer.length > 0);

  const create = api.memberships.createFanToken.useMutation({
    onSuccess: ({ code: made }) => {
      toast.success(`Fan token ${made} created`);
      void utils.memberships.fanToken.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  function submit() {
    if (!ready || !cover) return;
    if (mode === "GENERATE") create.mutate({ mode, coverUrl: cover.url });
    else if (mode === "CUSTOM") create.mutate({ mode, code, coverUrl: cover.url });
    else create.mutate({ mode, code, issuer, coverUrl: cover.url });
  }

  return (
    <section className="bg-surface grid max-w-2xl gap-5 rounded-xl border p-5 sm:p-6">
      <div>
        <h2 className="display text-lg">Create your fan token</h2>
        <p className="text-fg-muted mt-1 text-sm">
          Your tiers count how many of this token a fan holds, so you make it first. Fans get it from your pins, and the amount they hold decides their tier.
        </p>
      </div>

      <div role="radiogroup" aria-label="How to get a fan token" className="grid gap-2 sm:grid-cols-3">
        {WAYS.map((way) => (
          <button
            key={way.mode}
            type="button"
            role="radio"
            aria-checked={mode === way.mode}
            onClick={() => setMode(way.mode)}
            className={cn("grid content-start gap-1 rounded-lg border p-3 text-left transition-colors", mode === way.mode ? "border-fg bg-primary/10" : "hover:bg-surface-2")}
          >
            <way.icon className="size-4" />
            <b className="text-sm">{way.title}</b>
            <span className="text-fg-muted text-xs">{way.text}</span>
          </button>
        ))}
      </div>

      <Field label="Token code" htmlFor="ft-code" error={codeProblem}>
        <Input
          id="ft-code"
          value={shownCode}
          readOnly={mode === "GENERATE"}
          maxLength={12}
          autoComplete="off"
          aria-invalid={Boolean(codeProblem)}
          onChange={(event) => setCode(normalizeAssetCode(event.target.value))}
          className="max-w-56 font-mono"
        />
        <Note>{mode === "GENERATE" ? "Made from your name. If it's taken we add a number." : "Up to 12 letters and numbers. It can't be changed later."}</Note>
      </Field>

      {mode === "EXISTING" && (
        <Field label="Issuer (public key)" htmlFor="ft-issuer">
          <Input id="ft-issuer" value={issuer} maxLength={60} autoComplete="off" placeholder="G…" onChange={(event) => setIssuer(event.target.value.trim())} className="font-mono" />
          <Note>We check the token exists on Stellar. We can only read it, so you hand it out yourself.</Note>
        </Field>
      )}

      <Field label="Token image" htmlFor="ft-cover">
        <FileField id="ft-cover" accept="image/jpeg,image/png,image/webp,image/gif" value={cover} onChange={setCover} preview hint="Shown wherever fans see the token." />
      </Field>

      <Button type="button" className="justify-self-start" disabled={!ready || create.isPending} onClick={submit}>
        {create.isPending && <Loader2 className="animate-spin" />}
        Create {shownCode || "fan token"}
      </Button>
    </section>
  );
}
