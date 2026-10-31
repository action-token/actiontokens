"use client";

import { CheckCircle2, Loader2, Pencil, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { Field } from "@bandcoin/ui/patterns/form-page";
import { Avatar } from "@bandcoin/ui/patterns/person";

import { BIO_MAX, codeProblem, type Draft, issuerProblem, NAME_MAX, slugProblem } from "./model";
import { ImagePicker } from "./image-picker";

type Set = (patch: Partial<Draft>) => void;
export type LiveCheck = { state: "idle" | "checking" | "ok" | "bad"; message?: string };

/** 1 · Profile picture (needed) and cover (optional), with the page header previewed. */
export function PhotosStep({ draft, set }: { draft: Draft; set: Set }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Field label="Profile picture" required>
          <ImagePicker
            value={draft.avatarUrl}
            onChange={(avatarUrl) => set({ avatarUrl })}
            label="Add a photo"
            hint="Square works best"
            shape="round"
          />
        </Field>
        <Field label="Cover (optional)">
          <ImagePicker
            value={draft.coverUrl}
            onChange={(coverUrl) => set({ coverUrl })}
            label="Add a cover"
            hint="Wide, at least 1500 × 500"
            shape="wide"
          />
        </Field>
      </div>
      <PagePreview draft={draft} />
    </div>
  );
}

/** How the top of their page will look. */
export function PagePreview({ draft }: { draft: Draft }) {
  return (
    <div className="border-border overflow-hidden rounded-2xl border">
      <div className="from-primary/25 via-surface-2 to-primary/5 aspect-[4/1] bg-gradient-to-br">
        {draft.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
          <img src={draft.coverUrl} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="bg-surface flex items-end gap-3 px-4 pb-3">
        <Avatar
          src={draft.avatarUrl || null}
          name={draft.name || "?"}
          className="border-surface -mt-8 size-16 border-4 text-xl"
        />
        <p className="display min-w-0 truncate pb-1 text-lg">{draft.name || "Your name"}</p>
      </div>
    </div>
  );
}

/** 2 · Name and a line about them. */
export function DetailsStep({ draft, set }: { draft: Draft; set: Set }) {
  return (
    <div className="grid gap-5">
      <Field
        label="Artist or band name"
        htmlFor="ob-name"
        required
        hint={`${draft.name.length} / ${NAME_MAX}`}
      >
        <Input
          id="ob-name"
          value={draft.name}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoFocus
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>
      <Field
        label="A line about you (optional)"
        htmlFor="ob-bio"
        hint={`${draft.bio.length} / ${BIO_MAX}`}
      >
        <Textarea
          id="ob-bio"
          value={draft.bio}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="What you make, where you play, what fans get"
          onChange={(event) => set({ bio: event.target.value })}
        />
      </Field>
    </div>
  );
}

/** 3 · The fan token: a new one from their own account, or one they already have on Stellar. */
export function TokenStep({ draft, set, check }: { draft: Draft; set: Set; check: LiveCheck }) {
  const code = draft.tokenMode === "NEW" ? draft.code : draft.existingCode;
  const problem = code ? codeProblem(code) : null;
  return (
    <div className="grid gap-5">
      <p className="text-fg-muted text-sm">
        Fans hold your fan token to join your memberships, and you can give it out on pins and as
        gifts. It&apos;s made when an admin approves you.
      </p>
      <Tabs
        value={draft.tokenMode}
        onValueChange={(mode) => set({ tokenMode: mode as Draft["tokenMode"] })}
      >
        <TabsList>
          <TabsTrigger value="NEW">New token</TabsTrigger>
          <TabsTrigger value="EXISTING">Already on Stellar</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Field label="Token image" required>
          <ImagePicker
            value={draft.tokenImage}
            onChange={(tokenImage) => set({ tokenImage })}
            label="Add an image"
            shape="round"
          />
        </Field>
        {draft.tokenMode === "NEW" ? (
          <Field
            label="Code"
            htmlFor="ob-code"
            required
            error={problem}
            hint="4 to 12 letters or numbers. It's the token's name on Stellar and can't change."
          >
            <Input
              id="ob-code"
              value={draft.code}
              maxLength={12}
              className="font-mono uppercase"
              onChange={(event) =>
                set({ code: event.target.value.toUpperCase(), codeTouched: true })
              }
            />
          </Field>
        ) : (
          <div className="grid content-start gap-4">
            <Field label="Code" htmlFor="ob-existing-code" required error={problem}>
              <Input
                id="ob-existing-code"
                value={draft.existingCode}
                maxLength={12}
                className="font-mono uppercase"
                onChange={(event) => set({ existingCode: event.target.value.toUpperCase() })}
              />
            </Field>
            <Field
              label="Issuer"
              htmlFor="ob-issuer"
              required
              error={draft.issuer ? issuerProblem(draft.issuer) : null}
            >
              <Input
                id="ob-issuer"
                value={draft.issuer}
                spellCheck={false}
                placeholder="G…"
                className="font-mono text-xs"
                onChange={(event) => set({ issuer: event.target.value.toUpperCase().trim() })}
              />
            </Field>
            <CheckLine check={check} ok="Found on Stellar" />
          </div>
        )}
      </div>
    </div>
  );
}

/** 4 · The free page address, checked as they type. */
export function AddressStep({ draft, set, check }: { draft: Draft; set: Set; check: LiveCheck }) {
  const problem = draft.slug ? slugProblem(draft.slug) : null;
  return (
    <div className="grid gap-3">
      <Field label="Page address" htmlFor="ob-slug" required error={problem}>
        <div className="flex items-center gap-2">
          <span className="text-fg-muted shrink-0 text-sm">bandcoin.io/artist/</span>
          <Input
            id="ob-slug"
            value={draft.slug}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => set({ slug: event.target.value.toLowerCase(), slugTouched: true })}
          />
        </div>
      </Field>
      {!problem && <CheckLine check={check} ok="It's free" />}
      <p className="text-fg-faint text-xs">
        You can rename it later. A short bandcoin.io/name link is a separate option in Settings.
      </p>
    </div>
  );
}

function CheckLine({ check, ok }: { check: LiveCheck; ok: string }) {
  if (check.state === "idle") return null;
  if (check.state === "checking")
    return (
      <p className="text-fg-muted flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" /> Checking…
      </p>
    );
  return check.state === "ok" ? (
    <p className="text-success flex items-center gap-1.5 text-xs font-medium">
      <CheckCircle2 className="size-3.5" /> {ok}
    </p>
  ) : (
    <p role="alert" className="text-danger flex items-center gap-1.5 text-xs font-medium">
      <XCircle className="size-3.5" /> {check.message}
    </p>
  );
}

/** 5 · Everything in one card, each part with Edit. The payment sits under it. */
export function ReviewSummary({ draft, onEdit }: { draft: Draft; onEdit: (step: number) => void }) {
  const code = draft.tokenMode === "NEW" ? draft.code : draft.existingCode;
  return (
    <div className="grid gap-4">
      <PagePreview draft={draft} />
      <dl className="border-border divide-border divide-y rounded-2xl border text-sm">
        <Row label="Name" step={1} onEdit={onEdit}>
          {draft.name}
        </Row>
        <Row label="About" step={1} onEdit={onEdit}>
          {draft.bio || <span className="text-fg-faint">Nothing yet</span>}
        </Row>
        <Row label="Fan token" step={2} onEdit={onEdit}>
          <span className="flex items-center gap-2">
            {draft.tokenImage && (
              // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
              <img src={draft.tokenImage} alt="" className="size-6 rounded-full object-cover" />
            )}
            <span className="font-mono font-semibold">{code}</span>
            <span className="text-fg-muted">
              {draft.tokenMode === "NEW" ? "· new" : "· already on Stellar"}
            </span>
          </span>
        </Row>
        <Row label="Page" step={3} onEdit={onEdit}>
          bandcoin.io/artist/{draft.slug}
        </Row>
      </dl>
    </div>
  );
}

function Row({
  label,
  step,
  onEdit,
  children,
}: {
  label: string;
  step: number;
  onEdit: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <dt className="text-fg-muted w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
      <Button type="button" variant="ghost" size="xs" onClick={() => onEdit(step)}>
        <Pencil /> Edit
      </Button>
    </div>
  );
}
