"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Ticket,
  XCircle,
} from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";

import { api, type RouterOutputs } from "~/trpc/react";

import { FanAvatar, PlaceLabel, TypeIcon, messageOf } from "./parts";

type Lookup = RouterOutputs["redeem"]["lookup"];
type Found = Extract<Lookup, { status: "pending" | "already_redeemed" }>["claim"];

const CODE_LENGTH = 6;

/** Check a fan's code, see who and what it is for, then redeem it. */
export function CodeChecker() {
  const utils = api.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [redeemedNow, setRedeemedNow] = useState<Date | null>(null);

  const refresh = () => {
    void utils.redeem.summary.invalidate();
    void utils.redeem.rewards.invalidate();
    void utils.redeem.history.invalidate();
    void utils.admin.activity.list.invalidate();
  };
  const lookup = api.redeem.lookup.useMutation({
    onSuccess: setResult,
    onError: (error) => toast.error(messageOf(error)),
  });
  const redeem = api.redeem.redeem.useMutation({
    onSuccess: (outcome) => {
      refresh();
      if (outcome.status === "success") {
        setResult({ status: "pending", claim: outcome.claim });
        setRedeemedNow(new Date(outcome.claim.redeemedAt ?? Date.now()));
        toast.success("Redeemed");
      } else setResult(outcome);
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const reset = () => {
    setCode("");
    setResult(null);
    setRedeemedNow(null);
    lookup.reset();
    redeem.reset();
    setTimeout(() => input.current?.focus(), 0);
  };
  const check = (event?: FormEvent) => {
    event?.preventDefault();
    if (code.length !== CODE_LENGTH || lookup.isPending) return;
    setResult(null);
    setRedeemedNow(null);
    lookup.mutate({ code });
  };

  const found = result && result.status !== "not_found" ? result : null;

  return (
    <section className="bg-surface grid gap-4 rounded-[1.4rem] border-2 p-4 sm:p-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <form onSubmit={check} className="flex flex-col">
        <h2 className="display flex items-center gap-2 text-lg">
          <Ticket className="text-primary-text size-5" /> Redeem a code
        </h2>
        <p className="text-fg-muted mt-1 text-sm">
          Ask the fan for the {CODE_LENGTH}-character code from their collected pin.
        </p>
        <label htmlFor="redeem-code" className="sr-only">
          Redeem code
        </label>
        <Input
          ref={input}
          id="redeem-code"
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          placeholder="ABC234"
          onChange={(event) => {
            setCode(
              event.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, CODE_LENGTH),
            );
            if (result) setResult(null);
          }}
          className="placeholder:text-fg-faint mt-4 h-14 text-center font-mono text-2xl font-semibold tracking-[0.35em] placeholder:tracking-[0.35em]"
        />
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-5 rounded-full transition-colors",
                i < code.length ? "bg-primary" : "bg-surface-2",
              )}
            />
          ))}
        </div>
        <Button
          type="submit"
          className="mt-4"
          disabled={code.length !== CODE_LENGTH || lookup.isPending}
        >
          {lookup.isPending ? <Loader2 className="animate-spin" /> : <Search />} Check code
        </Button>
      </form>

      <div className="bg-surface-2 min-h-44 rounded-lg border border-dashed p-4" aria-live="polite">
        {result?.status === "not_found" ? (
          <ResultShell
            tone="error"
            icon={XCircle}
            title="Code not found"
            onReset={reset}
            resetLabel="Try again"
          >
            <p className="text-fg-muted text-sm">
              Check the code with the fan: it&apos;s {CODE_LENGTH} letters and numbers, shown after
              they collect the pin.
            </p>
          </ResultShell>
        ) : redeemedNow && found ? (
          <ResultShell
            tone="success"
            icon={CheckCircle2}
            title="Redeemed: hand over the reward"
            onReset={reset}
            resetLabel="Redeem another"
          >
            <FanAndReward claim={found.claim} />
            <p className="text-fg-muted mt-3 text-xs">Redeemed {format(redeemedNow, "PPp")}</p>
          </ResultShell>
        ) : found?.status === "already_redeemed" ? (
          <ResultShell
            tone="warning"
            icon={AlertCircle}
            title="Already redeemed"
            onReset={reset}
            resetLabel="Check another"
          >
            <FanAndReward claim={found.claim} />
            {found.claim.redeemedAt && (
              <p className="text-fg-muted mt-3 text-xs">
                Redeemed {format(new Date(found.claim.redeemedAt), "PPp")}
              </p>
            )}
          </ResultShell>
        ) : found ? (
          <div>
            <p className="text-primary-text flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5" /> Valid code: ready to redeem
            </p>
            <div className="mt-3">
              <FanAndReward claim={found.claim} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={redeem.isPending} onClick={() => redeem.mutate({ code })}>
                {redeem.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Redeem
              </Button>
              <Button variant="ghost" onClick={reset} disabled={redeem.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-fg-muted flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <Ticket className="text-fg-faint size-7" />
            The fan and their reward show here, so you can check before redeeming.
          </div>
        )}
      </div>
    </section>
  );
}

function ResultShell({
  tone,
  icon: Icon,
  title,
  children,
  onReset,
  resetLabel,
}: {
  tone: "success" | "warning" | "error";
  icon: typeof CheckCircle2;
  title: string;
  children: ReactNode;
  onReset: () => void;
  resetLabel: string;
}) {
  const color =
    tone === "success" ? "text-primary-text" : tone === "warning" ? "text-warning" : "text-danger";
  return (
    <div>
      <p className={cn("flex items-center gap-2 font-semibold", color)}>
        <Icon className="size-5" /> {title}
      </p>
      <div className="mt-3">{children}</div>
      <Button variant="outline" size="sm" className="mt-4" onClick={onReset}>
        <RotateCcw /> {resetLabel}
      </Button>
    </div>
  );
}

function FanAndReward({ claim }: { claim: Found }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="bg-surface flex items-center gap-3 rounded-lg border p-3">
        <FanAvatar fan={claim.fan} className="size-10" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{claim.fan.name ?? "Fan"}</p>
          {claim.fan.email && <p className="text-fg-muted truncate text-xs">{claim.fan.email}</p>}
          <p className="text-fg-muted text-xs">
            Collected {formatDistanceToNow(new Date(claim.collectedAt), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="bg-surface flex items-start gap-3 rounded-lg border p-3">
        {claim.pin.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={claim.pin.imageUrl}
            alt=""
            className="size-10 shrink-0 rounded-md object-cover"
          />
        ) : (
          <TypeIcon type={claim.pin.type} />
        )}
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{claim.pin.title}</p>
          <div className="text-fg-muted text-xs">
            <PlaceLabel latitude={claim.latitude} longitude={claim.longitude} />
          </div>
        </div>
      </div>
    </div>
  );
}
