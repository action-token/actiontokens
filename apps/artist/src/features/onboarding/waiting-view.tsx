"use client";

import { Check, Clock, ExternalLink, LifeBuoy, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { stellarExpertAccountUrl } from "@bandcoin/wallet/config";
import { Button } from "@bandcoin/ui/components/button";
import { Progress } from "@bandcoin/ui/components/progress";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";
import { fromApplication } from "./wizard/model";
import { PageCard } from "./wizard/steps";

/** Reviews usually take this long; the bar fills over it but never reads "done". */
const REVIEW_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Paid and waiting for an admin, as in Wadzzo's pending page: the page they
 * sent, where the application stands, and what happens next. Nothing to do.
 */
export function WaitingView() {
  const application = api.onboarding.application.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [now] = useState(() => Date.now());
  if (application.isPending || !application.data) return <WaitingSkeleton />;

  const { issuer } = application.data;
  const sentAt = issuer?.openedAt ? new Date(issuer.openedAt) : null;
  const days = sentAt ? Math.max(0, (now - sentAt.getTime()) / DAY) : 0;
  const progress = Math.max(15, Math.min(90, Math.round((days / REVIEW_DAYS) * 100)));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <p className="marker text-primary-text text-sm">artist portal</p>
        <h1 className="display text-4xl sm:text-5xl">You&apos;re in review</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Your artist account is open and your page is with an admin. Nothing else to do.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="grid gap-3">
          <h2 className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
            Your page, as you sent it
          </h2>
          <PageCard draft={fromApplication(application.data)} />
        </section>

        <aside className="bg-surface border-fg/10 grid gap-5 overflow-hidden rounded-[1.4rem] border-2 p-5 shadow-[6px_7px_0_0_var(--color-primary)]">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-11 -rotate-6 items-center justify-center rounded-xl">
              <Clock className="size-5" strokeWidth={2.4} />
            </span>
            <div>
              <p className="display text-2xl">Application pending</p>
              {sentAt && (
                <p className="text-fg-muted text-xs">
                  Sent{" "}
                  {sentAt.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-fg-muted">Status</span>
              <span className="text-primary-text font-semibold">In review</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-fg-faint text-xs">Reviews usually take 2 to 3 business days.</p>
          </div>

          <ol className="grid gap-3">
            <Step done title="Artist account opened">
              {issuer ? (
                <a
                  href={stellarExpertAccountUrl(issuer.publicKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-fg inline-flex items-center gap-1 font-mono"
                >
                  {abbreviateAddress(issuer.publicKey, 5)} <ExternalLink className="size-3" />
                </a>
              ) : (
                "Paid 1.5 XLM"
              )}
            </Step>
            <Step current title="An admin reviews your page">
              You hear back here, on this page.
            </Step>
            <Step title="Fan token made, tools unlock">
              Then drop pins, sell music and items, and set up memberships.
            </Step>
          </ol>

          <div className="border-border flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" asChild>
              <a href={`${FAN_APP_URL}/support`} target="_blank" rel="noreferrer">
                <LifeBuoy /> Contact support
              </a>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({
  title,
  done = false,
  current = false,
  children,
}: {
  title: string;
  done?: boolean;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3" aria-current={current ? "step" : undefined}>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          done && "bg-success/15 text-success",
          current && "bg-primary text-primary-foreground",
          !done && !current && "bg-surface-2 text-fg-faint",
        )}
      >
        {done ? (
          <Check className="size-4" strokeWidth={3} />
        ) : current ? (
          <Clock className="size-4" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 text-sm">
        <p className={cn("font-medium", !done && !current && "text-fg-muted")}>{title}</p>
        <p className="text-fg-muted text-xs">{children}</p>
      </div>
    </li>
  );
}

function WaitingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl" aria-busy aria-label="Loading">
      <Skeleton className="mb-2 h-4 w-24" />
      <Skeleton className="mb-2 h-10 w-72 max-w-full" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-96 rounded-[1.4rem]" />
      </div>
    </div>
  );
}
