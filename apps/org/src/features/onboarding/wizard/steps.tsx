"use client";

import {
  CheckCircle2,
  Coins,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { cn } from "@actiontokens/ui/lib/cn";
import { Field } from "@actiontokens/ui/patterns/form-page";

import { api } from "~/trpc/react";

import { AiImagePanel } from "../../ai/ai-image-panel";
import { AiTextButton } from "../../ai/ai-text-button";
import { ChangeBadge, UploadArea } from "./image-picker";
import {
  BIO_MAX,
  codeProblem,
  type Draft,
  issuerProblem,
  NAME_MAX,
  slugProblem,
  tokenPicture,
} from "./model";

type Set = (patch: Partial<Draft>) => void;

/** A starting brief for the AI, from what the artist has typed. */
const about = (draft: Draft) =>
  [draft.name.trim() && `for the artist "${draft.name.trim()}"`, draft.bio.trim().slice(0, 300)]
    .filter(Boolean)
    .join(". ");
const coverBrief = (draft: Draft) =>
  `A wide cover banner ${about(draft) || "for a music artist"}. Atmospheric, room on the left for a profile photo.`;
const tokenBrief = (draft: Draft, code: string) =>
  `A round badge for a fan token${code ? ` called ${code.toUpperCase()}` : ""} ${about(draft)}. Bold, simple, centred, works small.`;

/** "Suggest codes": three AI ideas that fit the name, one click to use. */
function CodeSuggestions({ draft, onPick }: { draft: Draft; onPick: (code: string) => void }) {
  const suggest = api.ai.suggestTokenCodes.useMutation();
  const ready = draft.name.trim().length >= 2;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={!ready || suggest.isPending}
        title={ready ? undefined : "Add your name on step 1 first"}
        onClick={() => suggest.mutate({ name: draft.name, bio: draft.bio })}
      >
        {suggest.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Sparkles className="text-primary-text" />
        )}
        {suggest.data ? "More ideas" : "Suggest with AI"}
      </Button>
      {suggest.data?.codes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onPick(code)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold tracking-wider transition-colors",
            draft.code === code ? "bg-primary border-fg" : "border-border hover:border-fg/40",
          )}
        >
          {code}
        </button>
      ))}
      {suggest.error && <span className="text-danger text-xs">{suggest.error.message}</span>}
    </div>
  );
}
export type LiveCheck = { state: "idle" | "checking" | "ok" | "bad"; message?: string };

/** What this step asks, in a sentence or two. */
function StepHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="grid gap-1">
      <h2 className="display text-3xl sm:text-4xl">{title}</h2>
      <p className="text-fg-muted max-w-prose text-sm text-pretty">{children}</p>
    </header>
  );
}

/** 1 · The top of their page, editable in place (click the cover or the photo), then name and bio. */
export function ProfileStep({ draft, set }: { draft: Draft; set: Set }) {
  return (
    <div className="grid gap-6">
      <StepHeading title="Show fans who you are">
        This is the top of your page. Add your photo (click the circle) and, if you like, a cover
        (click the banner). Then tell fans your name.
      </StepHeading>

      <div>
        <UploadArea
          label={draft.coverUrl ? "Change the cover" : "Add a cover"}
          onChange={(coverUrl) => set({ coverUrl })}
          className="from-primary/25 via-surface-2 to-primary/5 aspect-[3/1] rounded-2xl bg-gradient-to-br"
        >
          {draft.coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- images come from our storage */}
              <img src={draft.coverUrl} alt="" className="size-full object-cover" />
              <ChangeBadge className="top-3 right-3" />
            </>
          ) : (
            <span className="text-fg-muted group-hover:text-fg absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors">
              <ImagePlus className="size-6" />
              Add a cover
              <span className="text-fg-faint text-xs font-normal">Optional · wide, 1500 × 500</span>
            </span>
          )}
        </UploadArea>

        <div className="-mt-12 flex items-end gap-4 px-4 sm:-mt-14 sm:px-6">
          <UploadArea
            label={draft.avatarUrl ? "Change your photo" : "Add your photo"}
            onChange={(avatarUrl) => set({ avatarUrl })}
            className="bg-surface size-24 shrink-0 overflow-visible rounded-full sm:size-28"
          >
            <span
              className={cn(
                "flex size-full items-center justify-center overflow-hidden rounded-full border-4 border-[var(--color-surface)]",
                !draft.avatarUrl &&
                  "bg-surface-2 outline-primary text-fg-muted group-hover:text-fg outline-2 -outline-offset-6 outline-dashed",
              )}
            >
              {draft.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
                <img src={draft.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="grid justify-items-center gap-0.5 text-xs font-semibold">
                  <ImagePlus className="size-5" />
                  Your photo
                </span>
              )}
            </span>
            {draft.avatarUrl && <ChangeBadge className="right-0 bottom-0" />}
          </UploadArea>
          <div className="min-w-0 pb-2">
            <p className="display truncate text-2xl">{draft.name || "Your name"}</p>
            <p className="text-fg-faint text-xs">
              {draft.avatarUrl ? "Looking good." : "Add a photo to go on."}
            </p>
          </div>
        </div>
        <AiImagePanel
          form="profile"
          aspect="wide"
          label="Make a cover with AI"
          suggestedPrompt={coverBrief(draft)}
          onImage={(coverUrl) => set({ coverUrl })}
        />
      </div>

      <div className="grid gap-5">
        <Field
          label="Organization name"
          htmlFor="ob-name"
          required
          hint={`${draft.name.length} / ${NAME_MAX}`}
        >
          <Input
            id="ob-name"
            value={draft.name}
            maxLength={NAME_MAX}
            autoComplete="off"
            placeholder="e.g. Luna Vale"
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>
        <Field
          label="About you (optional)"
          htmlFor="ob-bio"
          hint={`${draft.bio.length} / ${BIO_MAX}`}
          action={
            draft.name.trim().length >= 2 ? (
              <AiTextButton
                form="profile"
                field="bio"
                value={draft.bio}
                maxChars={BIO_MAX}
                context={{ name: draft.name, bio: draft.bio }}
                onChange={(bio) => set({ bio })}
              />
            ) : undefined
          }
        >
          <Textarea
            id="ob-bio"
            value={draft.bio}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="What you make, where you play, what fans get"
            onChange={(event) => set({ bio: event.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/** 2 · The fan token: a new one from their own account, or one they already have on Stellar. */
export function TokenStep({ draft, set, check }: { draft: Draft; set: Set; check: LiveCheck }) {
  const isNew = draft.tokenMode === "NEW";
  const code = isNew ? draft.code : draft.existingCode;
  const picture = tokenPicture(draft);
  const problem = code ? codeProblem(code) : null;
  return (
    <div className="grid gap-6">
      <StepHeading title="Choose your fan token">
        Fans hold it to join your memberships, and you can hand it out on pins and as gifts.
        It&apos;s made when an admin approves you.
      </StepHeading>

      <div role="radiogroup" aria-label="Fan token" className="grid gap-3 sm:grid-cols-2">
        <Choice
          on={isNew}
          icon={Plus}
          title="Make a new token"
          onSelect={() => set({ tokenMode: "NEW" })}
        >
          Pick a code and an image. It&apos;s issued from your own Action Tokens account.
        </Choice>
        <Choice
          on={!isNew}
          icon={Coins}
          title="Use a token I already have"
          onSelect={() => set({ tokenMode: "EXISTING" })}
        >
          A token you issued on Stellar before. We check it on the network.
        </Choice>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <div className="grid justify-items-center gap-2">
          {isNew ? (
            <UploadArea
              label={picture ? "Change the token image" : "Add a token image"}
              onChange={(tokenImage) => set({ tokenImage })}
              className="size-28 overflow-visible rounded-full"
            >
              <span
                className={cn(
                  "flex size-full items-center justify-center overflow-hidden rounded-full",
                  picture
                    ? "border-border border"
                    : "bg-surface-2 outline-primary text-fg-muted group-hover:text-fg outline-2 -outline-offset-4 outline-dashed",
                )}
              >
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
                  <img src={picture} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid justify-items-center gap-0.5 text-xs font-semibold">
                    <ImagePlus className="size-5" />
                    Image
                  </span>
                )}
              </span>
              {picture && <ChangeBadge className="right-0 bottom-0" />}
            </UploadArea>
          ) : (
            // A token already on Stellar keeps the image it has there: nothing to upload.
            <span className="bg-surface-2 border-border flex size-28 items-center justify-center overflow-hidden rounded-full border">
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- the image its issuer published
                <img src={picture} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-fg-muted font-mono text-sm font-bold tracking-wider">
                  {code.toUpperCase().slice(0, 6) || "?"}
                </span>
              )}
            </span>
          )}
          <p className="text-fg-faint max-w-36 text-center text-xs">
            {isNew
              ? "Square, round crop"
              : picture
                ? "Its image on Stellar"
                : check.state === "ok"
                  ? "No image published on Stellar"
                  : "Shown once it's found"}
          </p>
        </div>

        {isNew ? (
          <Field
            label="Token code"
            htmlFor="ob-code"
            required
            error={problem}
            hint="4 to 12 letters or numbers. It's the token's name on Stellar and can't change later."
          >
            <Input
              id="ob-code"
              value={draft.code}
              maxLength={12}
              placeholder="e.g. LUNA"
              className="font-mono text-base tracking-wider uppercase"
              onChange={(event) =>
                set({ code: event.target.value.toUpperCase(), codeTouched: true })
              }
            />
            <CodeSuggestions draft={draft} onPick={(code) => set({ code, codeTouched: true })} />
          </Field>
        ) : (
          <div className="grid content-start gap-4">
            <Field label="Token code" htmlFor="ob-existing-code" required error={problem}>
              <Input
                id="ob-existing-code"
                value={draft.existingCode}
                maxLength={12}
                placeholder="e.g. LUNA"
                className="font-mono text-base tracking-wider uppercase"
                onChange={(event) => set({ existingCode: event.target.value.toUpperCase() })}
              />
            </Field>
            <Field
              label="Issuer account"
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
            <CheckLine check={check} ok="Found on Stellar and free to use" />
          </div>
        )}
      </div>

      {isNew && (
        <AiImagePanel
          form="profile"
          aspect="square"
          label="Make the token image with AI"
          suggestedPrompt={tokenBrief(draft, code)}
          onImage={(tokenImage) => set({ tokenImage })}
        />
      )}

      {code && !problem && picture && (
        <TokenChip image={picture} code={code} note={isNew ? "New" : "Your own"} />
      )}
    </div>
  );
}

function Choice({
  on,
  icon: Icon,
  title,
  onSelect,
  children,
}: {
  on: boolean;
  icon: LucideIcon;
  title: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
        on ? "border-fg bg-primary/12" : "border-border hover:border-fg/30",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          on ? "bg-primary text-primary-foreground" : "bg-surface-2 text-fg-muted",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-fg-muted mt-0.5 block text-xs">{children}</span>
      </span>
    </button>
  );
}

/** The token as fans will see it. */
function TokenChip({ image, code, note }: { image: string; code: string; note: string }) {
  return (
    <div className="bg-surface-2/60 border-border flex items-center gap-3 justify-self-start rounded-full border py-1.5 pr-4 pl-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- images come from our storage */}
      <img src={image} alt="" className="size-8 rounded-full object-cover" />
      <span className="font-mono text-sm font-bold tracking-wider">{code.toUpperCase()}</span>
      <span className="text-fg-muted flex items-center gap-1 text-xs">
        <Sparkles className="size-3.5" /> {note} · made when you&apos;re approved
      </span>
    </div>
  );
}

/** 3 · The free page address, checked as they type. */
export function AddressStep({ draft, set, check }: { draft: Draft; set: Set; check: LiveCheck }) {
  const problem = draft.slug ? slugProblem(draft.slug) : null;
  return (
    <div className="grid gap-6">
      <StepHeading title="Pick your page address">
        Where fans find you. It&apos;s free, and you can rename it later.
      </StepHeading>
      <div className="grid gap-2">
        <label htmlFor="ob-slug" className="text-sm font-medium">
          Page address <span className="text-danger">*</span>
        </label>
        <div
          className={cn(
            "bg-surface focus-within:ring-ring flex h-12 items-center overflow-hidden rounded-xl border focus-within:ring-2",
            problem || check.state === "bad" ? "border-danger" : "border-border",
          )}
        >
          <span className="bg-surface-2 text-fg-muted flex h-full items-center gap-1.5 border-r px-3 text-sm">
            <Link2 className="size-4" /> action-tokens.com/artist/
          </span>
          <input
            id="ob-slug"
            value={draft.slug}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent px-3 font-medium outline-none"
            onChange={(event) => set({ slug: event.target.value.toLowerCase(), slugTouched: true })}
          />
        </div>
        {problem ? (
          <p role="alert" className="text-danger text-xs font-medium">
            {problem}
          </p>
        ) : (
          <CheckLine check={check} ok="It's free" />
        )}
      </div>
      <p className="text-fg-faint text-xs">
        Want a short action-tokens.com/name link too? You can add one in Settings once you&apos;re
        in.
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

/** 4 · Everything in one card, each part with Edit, and what happens after paying. */
export function ReviewSummary({ draft, onEdit }: { draft: Draft; onEdit: (step: number) => void }) {
  return (
    <div className="grid gap-6">
      <StepHeading title="Check and send">
        Make sure it all looks right. Paying opens your organization account and sends your page to
        an admin.
      </StepHeading>

      <PageCard draft={draft} onEdit={onEdit} />

      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {[
          "You pay 1.5 XLM to open your organization account",
          "An admin reviews your page",
          "Your fan token is made and your tools unlock",
        ].map((text, index) => (
          <li key={text} className="bg-surface-2/60 flex items-start gap-2 rounded-xl p-3">
            <span className="bg-fg text-bg flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
              {index + 1}
            </span>
            <span className="text-fg-muted">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EditButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button type="button" variant="secondary" size="xs" onClick={onClick} className={className}>
      <Pencil /> Edit
    </Button>
  );
}

function Row({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <dt className="text-fg-muted w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 truncate">{children}</dd>
      {onEdit && <EditButton onClick={onEdit} />}
    </div>
  );
}

/** Their page as they set it up: cover, photo, name, bio, fan token and address. Edit buttons when `onEdit` is given. */
export function PageCard({ draft, onEdit }: { draft: Draft; onEdit?: (step: number) => void }) {
  const code = draft.tokenMode === "NEW" ? draft.code : draft.existingCode;
  return (
    <div className="border-border overflow-hidden rounded-2xl border">
      <div className="from-primary/25 via-surface-2 to-primary/5 relative aspect-[4/1] bg-gradient-to-br">
        {draft.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
          <img src={draft.coverUrl} alt="" className="size-full object-cover" />
        )}
        {onEdit && <EditButton onClick={() => onEdit(0)} className="absolute top-2 right-2" />}
      </div>
      <div className="flex items-start gap-3 px-4 pb-4">
        {/* Above the cover (which is positioned for its Edit button), not under it. */}
        <span className="bg-surface-2 relative z-10 -mt-10 size-20 shrink-0 overflow-hidden rounded-full border-4 border-[var(--color-surface)] shadow-sm">
          {draft.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
            <img src={draft.avatarUrl} alt="" className="size-full object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1 pt-3">
          <p className="display truncate text-2xl">{draft.name}</p>
          <p className="text-fg-muted line-clamp-2 text-sm">
            {draft.bio || "No line about you yet."}
          </p>
        </div>
        {onEdit && <EditButton onClick={() => onEdit(0)} className="mt-2" />}
      </div>
      <dl className="border-border divide-border divide-y border-t text-sm">
        <Row label="Fan token" onEdit={onEdit && (() => onEdit(1))}>
          <span className="flex items-center gap-2">
            {tokenPicture(draft) && (
              // eslint-disable-next-line @next/next/no-img-element -- ours, or the issuer's published image
              <img src={tokenPicture(draft)} alt="" className="size-6 rounded-full object-cover" />
            )}
            <span className="font-mono font-semibold tracking-wider">{code}</span>
            <span className="text-fg-muted">
              {draft.tokenMode === "NEW" ? "new" : "your own, on Stellar"}
            </span>
          </span>
        </Row>
        <Row label="Page" onEdit={onEdit && (() => onEdit(2))}>
          <span className="font-medium">action-tokens.com/artist/{draft.slug}</span>
        </Row>
      </dl>
    </div>
  );
}
