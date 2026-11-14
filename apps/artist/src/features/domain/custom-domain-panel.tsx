"use client";

import { Check, Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { normalizeDomain, validateDomain } from "@bandcoin/utils/domain";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { PanelCard, PanelSection } from "./panel-card";

type Domain = NonNullable<RouterOutputs["domain"]["overview"]["domain"]>;
type DnsRecord = Domain["records"][number];

const day = (date: Date | string) =>
  new Date(date).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

/** One plain line about where the domain stands; only one that needs action gets a warning colour. */
const STATUS: Record<Domain["status"], { warn: boolean; say: (d: Domain) => string }> = {
  NEEDS_SETUP: {
    warn: true,
    say: () => "Needs verifying. It came from the old Bandcoin and has to be connected again.",
  },
  PENDING: { warn: false, say: () => "Waiting for the DNS records below." },
  LIVE: {
    warn: false,
    say: (d) => `Live since ${day(d.verifiedAt ?? new Date())}. It shows your artist page.`,
  },
  BROKEN: {
    warn: true,
    say: (d) => `Stopped working on ${day(d.brokenSince ?? new Date())}. Check the records below.`,
  },
};

/**
 * Settings › Custom domain (plan 32): the artist's own domain showing their
 * artist page. Free, one per artist. Opening the tab reads the status fresh
 * from the host; "Check now" does it again.
 */
export function CustomDomainPanel() {
  const overview = api.domain.overview.useQuery(undefined, { refetchOnWindowFocus: false });

  if (overview.isPending) return <Skeleton className="h-64 w-full rounded-[1.4rem]" />;
  if (overview.isError)
    return (
      <ErrorState message="Couldn't load your domain." onRetry={() => void overview.refetch()} />
    );
  const { available, domain } = overview.data;
  if (domain)
    return (
      <DomainCard
        domain={domain}
        checking={overview.isFetching}
        onCheck={() => void overview.refetch()}
      />
    );
  if (!available)
    return (
      <PanelCard>
        <p className="text-fg-muted text-sm">
          Custom domains aren&apos;t open yet. This tab will let you connect one soon.
        </p>
      </PanelCard>
    );
  return <AddDomain />;
}

function AddDomain() {
  const utils = api.useUtils();
  const [value, setValue] = useState("");
  const domain = normalizeDomain(value);
  const problem = value.trim() ? validateDomain(domain) : null;
  const add = api.domain.add.useMutation({
    onSuccess: () => {
      toast.success("Domain added. Now add its DNS records.");
      return utils.domain.overview.invalidate();
    },
  });

  return (
    <PanelCard>
      <div className="grid gap-2">
        <Label htmlFor="custom-domain">Your domain</Label>
        <Input
          id="custom-domain"
          value={value}
          maxLength={253}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder="yourname.com"
          onChange={(event) => setValue(event.target.value)}
        />
        <p className="min-h-5 text-xs" aria-live="polite">
          {problem ? (
            <span className="text-danger">{problem}</span>
          ) : (
            <span className="text-fg-faint">
              A root domain like yourname.com also gets www.yourname.com, which sends visitors to
              it. Or use a subdomain like music.yourname.com.
            </span>
          )}
        </p>
      </div>
      <div className="grid gap-2">
        <Button
          className="justify-self-start"
          disabled={!domain || Boolean(problem) || add.isPending}
          onClick={() => add.mutate({ domain })}
        >
          {add.isPending ? <Loader2 className="animate-spin" /> : <Globe />}
          {add.isPending ? "Connecting…" : "Connect domain"}
        </Button>
        {add.error && <p className="text-danger text-sm">{add.error.message}</p>}
        <p className="text-fg-faint text-xs">
          Free. You need access to your domain&apos;s DNS settings.
        </p>
      </div>
    </PanelCard>
  );
}

function DomainCard({
  domain,
  checking,
  onCheck,
}: {
  domain: Domain;
  checking: boolean;
  onCheck: () => void;
}) {
  const utils = api.useUtils();
  const [confirm, setConfirm] = useState(false);
  const refresh = () => utils.domain.overview.invalidate();
  const reconnect = api.domain.reconnect.useMutation({ onSuccess: refresh });
  const remove = api.domain.remove.useMutation({
    onSuccess: () => {
      toast.success("Domain removed");
      setConfirm(false);
      return refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const status = STATUS[domain.status];

  return (
    <PanelCard>
      <div className="grid gap-1">
        <a
          href={`https://${domain.domain}`}
          target="_blank"
          rel="noreferrer"
          className="display truncate text-2xl hover:underline"
        >
          {domain.domain}
        </a>
        <p className={status.warn ? "text-danger text-sm font-medium" : "text-fg-muted text-sm"}>
          {status.say(domain)}
        </p>
        {domain.lastError && domain.status !== "LIVE" && (
          <p className="text-fg-muted text-xs">{domain.lastError}</p>
        )}
        {domain.lastCheckedAt && (
          <p className="text-fg-faint text-xs">Checked {timeAgo(domain.lastCheckedAt)}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {domain.status === "NEEDS_SETUP" ? (
          <Button disabled={reconnect.isPending} onClick={() => reconnect.mutate()}>
            {reconnect.isPending ? <Loader2 className="animate-spin" /> : <Globe />}
            {reconnect.isPending ? "Connecting…" : "Connect again"}
          </Button>
        ) : (
          <Button
            variant={status.warn ? "default" : "outline"}
            disabled={checking}
            onClick={onCheck}
          >
            <RefreshCw className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking…" : "Check now"}
          </Button>
        )}
        <Button variant="outline" onClick={() => setConfirm(true)}>
          <Trash2 /> Remove
        </Button>
      </div>
      {reconnect.error && <p className="text-danger text-sm">{reconnect.error.message}</p>}

      {domain.records.length > 0 &&
        (domain.status === "LIVE" ? (
          <details className="border-t pt-4">
            <summary className="text-fg-muted cursor-pointer text-sm">DNS records</summary>
            <div className="mt-4">
              <Records records={domain.records} />
            </div>
          </details>
        ) : (
          <PanelSection>
            <p className="text-fg-muted text-sm">
              Add these at the company you bought the domain from (its DNS settings). Changes can
              take up to 48 hours. We check every 15 minutes and tell you in your bell when
              it&apos;s live.
            </p>
            <Records records={domain.records} />
          </PanelSection>
        ))}

      <ConfirmDialog
        open={confirm}
        onOpenChange={(open) => !open && !remove.isPending && setConfirm(false)}
        title={`Remove ${domain.domain}?`}
        description="It stops showing your artist page right away. You can connect it again later."
        confirmLabel="Remove"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </PanelCard>
  );
}

function Records({ records }: { records: DnsRecord[] }) {
  return (
    <ul className="grid gap-3">
      {records.map((record) => (
        <li
          key={`${record.type}:${record.name}:${record.value}`}
          className="bg-surface-2 grid gap-2 rounded-xl p-3 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center"
        >
          <span className="font-semibold">
            {record.type}
            <span className="text-fg-faint block text-[11px] font-medium">
              {record.purpose === "ownership" ? "Proves it's yours" : "Points to Bandcoin"}
            </span>
          </span>
          <CopyValue label="Name" text={record.name} />
          <CopyValue label="Value" text={record.value} />
        </li>
      ))}
    </ul>
  );
}

function CopyValue({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label.toLowerCase()}`}
      className="hover:bg-surface flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      <span className="min-w-0 flex-1">
        <span className="text-fg-faint block text-[11px]">{label}</span>
        <span className="block truncate font-mono text-xs">{text}</span>
      </span>
      {copied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0" />}
    </button>
  );
}
