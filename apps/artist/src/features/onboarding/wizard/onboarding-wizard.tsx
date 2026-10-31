"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { assetCodeFrom } from "@bandcoin/utils/asset-code";
import { slugFromName } from "@bandcoin/utils/slug";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { api, type RouterOutputs } from "~/trpc/react";

import { PayToOpen } from "../../payments/pay-to-open";
import { useIssuerOpening } from "../use-issuer-opening";
import {
  clearDraft,
  codeProblem,
  type Draft,
  EMPTY_DRAFT,
  fanTokenOf,
  issuerProblem,
  readDraft,
  saveDraft,
  slugProblem,
  stepReady,
  STEPS,
} from "./model";
import { AddressStep, type LiveCheck, ProfileStep, ReviewSummary, TokenStep } from "./steps";

type Application = RouterOutputs["onboarding"]["application"];
const PAY = STEPS.length - 1;

/** Waits until a value stops changing for `ms`, so live checks don't run on every key. */
function useSettled<T>(value: T, ms = 400) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const fromApplication = (application: Application): Draft => {
  if (!application) return EMPTY_DRAFT;
  const token = application.pendingFanToken;
  return {
    ...EMPTY_DRAFT,
    avatarUrl: application.avatarUrl ?? "",
    coverUrl: application.coverUrl ?? "",
    name: application.name,
    bio: application.bio ?? "",
    slug: application.slug,
    slugTouched: true,
    ...(token?.mode === "NEW" ? { code: token.code, codeTouched: true } : {}),
    ...(token?.mode === "EXISTING"
      ? { tokenMode: "EXISTING", existingCode: token.code, issuer: token.issuer }
      : {}),
    tokenImage: token?.coverUrl ?? "",
  };
};

/**
 * Becoming an artist, laid out like Wadzzo's brand onboarding: photos,
 * details, fan token, page address, then review and pay 1.5 XLM to open the
 * account. Answers are kept in the browser, and an artist who already sent
 * them (rejected, or back before paying) starts from what they sent.
 */
export function OnboardingWizard({ paying }: { paying: boolean }) {
  const userId = useSession().data?.user?.id;
  const application = api.onboarding.application.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  if (!userId || application.isPending) return <WizardSkeleton />;
  return (
    <Wizard
      userId={userId}
      initial={readDraft(userId) ?? fromApplication(application.data ?? null)}
      startAt={paying ? PAY : 0}
    />
  );
}

function Wizard({ userId, initial, startAt }: { userId: string; initial: Draft; startAt: number }) {
  const utils = api.useUtils();
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(startAt);
  // The furthest step reached: the rail lets them jump back to any of those.
  const [reached, setReached] = useState(startAt);

  const set = (patch: Partial<Draft>) =>
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      // The code and the address follow the name until the artist types their own.
      if (patch.name !== undefined) {
        if (!next.codeTouched) next.code = assetCodeFrom(next.name);
        if (!next.slugTouched) next.slug = slugFromName(next.name);
      }
      saveDraft(userId, next);
      return next;
    });

  // Live checks, once the typing settles.
  const slug = useSettled(draft.slug);
  const slugValid = Boolean(slug) && !slugProblem(slug);
  const slugCheck = api.onboarding.checkSlug.useQuery(
    { slug },
    { enabled: slugValid && step === 2 },
  );
  const existing = useSettled({ code: draft.existingCode, issuer: draft.issuer });
  const existingValid =
    draft.tokenMode === "EXISTING" &&
    !codeProblem(existing.code) &&
    !issuerProblem(existing.issuer);
  const tokenCheck = api.onboarding.checkToken.useQuery(existing, {
    enabled: existingValid && step === 1,
  });
  // A found token brings the image its issuer published; keep it for the preview and review.
  const found = tokenCheck.data?.status === "OK" ? (tokenCheck.data.image ?? "") : null;
  const view = found !== null ? { ...draft, stellarImage: found } : draft;
  const live = {
    slug: liveOf(
      slugValid,
      slug === draft.slug,
      slugCheck.data && (slugCheck.data.ok ? null : slugCheck.data.message),
      slugCheck.isFetching,
    ),
    token: liveOf(
      existingValid,
      existing.code === draft.existingCode && existing.issuer === draft.issuer,
      tokenCheck.data && (tokenCheck.data.status === "OK" ? null : tokenCheck.data.message),
      tokenCheck.isFetching,
    ),
  };
  const ready = stepReady(step, draft, {
    slugOk: live.slug.state === "ok",
    tokenOk: live.token.state === "ok",
  });

  const submit = api.onboarding.submitApplication.useMutation({
    onError: (error) => toast.error(error.message),
  });
  const quote = api.onboarding.issuerQuote.useQuery(undefined, {
    enabled: step === PAY,
    refetchInterval: 30_000,
  });
  const flow = useIssuerOpening();
  // Once paid, the portal moves on to "waiting for approval"; the answers are sent.
  useEffect(() => {
    if (flow.step?.kind === "success") clearDraft(userId);
  }, [flow.step?.kind, userId]);

  const go = (to: number) => {
    setStep(to);
    setReached((prev) => Math.max(prev, to));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function next() {
    if (!ready) return;
    if (step < PAY - 1) return go(step + 1);
    // The address was the last question: send the application, then it's time to pay.
    await submit.mutateAsync({
      name: draft.name.trim(),
      slug: draft.slug,
      bio: draft.bio.trim() || undefined,
      avatarUrl: draft.avatarUrl,
      coverUrl: draft.coverUrl || undefined,
      fanToken: fanTokenOf(draft),
    });
    await Promise.all([
      utils.onboarding.issuerQuote.invalidate(),
      utils.onboarding.application.invalidate(),
    ]);
    go(PAY);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="marker text-primary-text text-sm">artist portal</p>
          <h1 className="display text-3xl sm:text-4xl">Set up your artist page</h1>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <span className="text-fg-muted text-xs font-medium">
            Step {step + 1} of {STEPS.length}
          </span>
          <div className="bg-surface-2 h-2 w-32 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Steps" className="hidden lg:block">
          <ol className="bg-surface border-fg/10 grid gap-1 rounded-[1.4rem] border-2 p-2">
            {STEPS.map((entry, index) => {
              const done = index < step || (index <= reached && index !== step);
              const current = index === step;
              const open = index <= reached && index !== PAY;
              return (
                <li key={entry.title}>
                  <button
                    type="button"
                    disabled={!open || current}
                    onClick={() => go(index)}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                      current && "bg-primary/15 font-semibold",
                      !current && open && "hover:bg-surface-2",
                      !open && !current && "opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                        current
                          ? "bg-primary text-primary-foreground"
                          : done
                            ? "bg-success/15 text-success"
                            : "bg-surface-2 text-fg-muted",
                      )}
                    >
                      {done && !current ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{entry.title}</span>
                      <span className="text-fg-muted block truncate text-xs font-normal">
                        {entry.desc}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="bg-surface border-fg/10 grid gap-6 rounded-[1.4rem] border-2 p-5 sm:p-7">
          {/* Phones have no rail: the steps as dots, the current one named. */}
          <div className="flex items-center gap-2 lg:hidden">
            {STEPS.map((entry, index) => (
              <span
                key={entry.title}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  index <= step ? "bg-primary" : "bg-surface-2",
                )}
              />
            ))}
            <span className="text-fg-muted ml-1 shrink-0 text-xs font-medium">
              {step + 1}/{STEPS.length} · {STEPS[step]!.title}
            </span>
          </div>

          {step === 0 && <ProfileStep draft={draft} set={set} />}
          {step === 1 && <TokenStep draft={view} set={set} check={live.token} />}
          {step === 2 && <AddressStep draft={draft} set={set} check={live.slug} />}
          {step === PAY && (
            <div className="grid gap-6">
              <ReviewSummary draft={view} onEdit={go} />
              <PayToOpen
                intro="This opens the Stellar account your fan token and everything you sell come from. You pay for it yourself; this is the whole price."
                quote={quote.data}
                loading={quote.isPending}
                flow={flow}
                action="send my application"
              />
            </div>
          )}

          {step !== PAY && (
            <div className="border-border flex items-center justify-between gap-2 border-t pt-5">
              <Button
                type="button"
                variant="outline"
                disabled={step === 0}
                onClick={() => go(step - 1)}
              >
                <ArrowLeft /> Back
              </Button>
              <Button
                type="button"
                disabled={!ready || submit.isPending}
                onClick={() => void next()}
              >
                {submit.isPending && <Loader2 className="animate-spin" />}
                {step === PAY - 1 ? "Review" : "Continue"} <ArrowRight />
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** A live check's state: nothing yet, still checking (or still typing), fine, or why not. */
function liveOf(
  valid: boolean,
  settled: boolean,
  result: string | null | undefined,
  fetching: boolean,
): LiveCheck {
  if (!valid) return { state: "idle" };
  if (!settled || fetching || result === undefined) return { state: "checking" };
  return result === null ? { state: "ok" } : { state: "bad", message: result };
}

/** The wizard's shape while the saved answers load. */
function WizardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl" aria-busy aria-label="Loading">
      <Skeleton className="mb-2 h-4 w-24" />
      <Skeleton className="mb-6 h-10 w-80 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <div className="hidden gap-2 rounded-[1.4rem] border-2 p-2 lg:grid">
          {STEPS.map((entry) => (
            <div key={entry.title} className="flex items-center gap-3 p-2.5">
              <Skeleton className="size-8 rounded-lg" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-5 rounded-[1.4rem] border-2 p-5 sm:p-7">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="aspect-[3/1] w-full rounded-2xl" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
