"use client";

import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { VANITY_HOST } from "./host";
import { NameField } from "./name-field";
import { PayPanel } from "./pay-panel";

type Overview = RouterOutputs["vanity"]["overview"];
type Link = NonNullable<Overview["link"]>;

const day = (date: Date | string) =>
  new Date(date).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

const STATUS: Record<
  Link["status"],
  { label: string; tone: "default" | "secondary" | "destructive"; say: (link: Link) => string }
> = {
  TRIAL: { label: "Free month", tone: "secondary", say: (l) => `Free until ${day(l.paidUntil)}.` },
  ACTIVE: { label: "Active", tone: "default", say: (l) => `Paid until ${day(l.paidUntil)}.` },
  GRACE: {
    label: "Renew now",
    tone: "destructive",
    say: (l) =>
      `It ran out on ${day(l.paidUntil)}. It keeps working until ${day(l.graceEndsAt)}, then visitors go to your normal page.`,
  },
  LAPSED: {
    label: "Stopped",
    tone: "destructive",
    say: (l) =>
      `Visitors go to your normal page. The name is yours until ${day(l.heldUntil)}; renew to turn it back on.`,
  },
};

/**
 * Domain: the artist's short link, bandcoin.io/their-name. The first month is
 * free; after that it is a monthly renewal (grace and name-keeping rules are in
 * services/artist/vanity). Naming it, renewing it and renaming it all show the
 * full price before anything is signed.
 */
export function DomainView() {
  const overview = api.vanity.overview.useQuery();

  return (
    <PageBody wide className="grid gap-6">
      <PageHeader
        eyebrow="Content"
        title="Domain"
        description="A short link to your page that fans can say out loud: the first month is free."
      />
      {overview.isPending ? (
        <Skeleton className="h-64 w-full max-w-3xl rounded-[1.4rem]" />
      ) : overview.isError ? (
        <ErrorState message="Couldn't load your link." onRetry={() => void overview.refetch()} />
      ) : (
        <div className="grid max-w-3xl gap-6">
          <LinkCard overview={overview.data} />
          <History payments={overview.data.payments} />
        </div>
      )}
    </PageBody>
  );
}

function LinkCard({ overview }: { overview: Overview }) {
  const { link, canClaimFree, prices } = overview;
  const utils = api.useUtils();
  const [value, setValue] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [panel, setPanel] = useState<"renew" | "rename" | null>(null);
  const onUsable = useCallback((next: string | null) => setName(next), []);
  const done = () => {
    setPanel(null);
    setValue("");
  };

  const claim = api.vanity.claim.useMutation({
    onSuccess: () => {
      done();
      return utils.vanity.overview.invalidate();
    },
  });

  // No link yet: choose a name, free the first time, paid after.
  if (!link) {
    return (
      <Card>
        <NameField value={value} onValue={setValue} onUsable={onUsable} />
        {canClaimFree ? (
          <div className="grid gap-2">
            <Button
              disabled={!name || claim.isPending}
              onClick={() => name && claim.mutate({ name })}
              className="justify-self-start"
            >
              <Link2 /> {claim.isPending ? "Saving…" : "Get my link, free for a month"}
            </Button>
            {claim.error && <p className="text-danger text-sm">{claim.error.message}</p>}
            <p className="text-fg-faint text-xs">
              After the free month it is <Price amount={prices.monthly} /> a month. If you
              don&apos;t renew, it keeps working for 7 more days.
            </p>
          </div>
        ) : name ? (
          <PayPanel purpose="RENEWAL" name={name} onDone={done} />
        ) : (
          <p className="text-fg-muted text-sm">
            Your free month is used up. Pick a name to pay for a month (
            <Price amount={prices.monthly} />
            ).
          </p>
        )}
      </Card>
    );
  }

  const status = STATUS[link.status];
  const url = `https://${VANITY_HOST}/${link.name}`;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="display truncate text-xl">
            {VANITY_HOST}/<b>{link.name}</b>
          </p>
          <p className="text-fg-muted mt-1 text-sm">{status.say(link)}</p>
        </div>
        <Badge variant={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={url} />
        {link.works && (
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          </Button>
        )}
        <Button
          variant={panel === "renew" ? "secondary" : "outline"}
          onClick={() => setPanel(panel === "renew" ? null : "renew")}
        >
          Renew for a month
        </Button>
        {link.works && (
          <Button
            variant={panel === "rename" ? "secondary" : "outline"}
            onClick={() => setPanel(panel === "rename" ? null : "rename")}
          >
            Change name
          </Button>
        )}
      </div>

      {panel === "renew" && (
        <Section title="Renew">
          <p className="text-fg-muted text-sm">
            A month is <Price amount={prices.monthly} />. Renewing early adds a month to the time
            you have left.
          </p>
          <PayPanel purpose="RENEWAL" onDone={done} />
        </Section>
      )}
      {panel === "rename" && (
        <Section title="Change the name">
          <p className="text-fg-muted text-sm">
            A new name is a one-time <Price amount={prices.nameChange} />. Your paid time stays. Old
            links to <b>{link.name}</b> stop working.
          </p>
          <NameField value={value} onValue={setValue} onUsable={onUsable} current={link.name} />
          {name && <PayPanel purpose="NAME_CHANGE" name={name} onDone={done} />}
        </Section>
      )}
    </Card>
  );
}

function Price({ amount }: { amount: Overview["prices"]["monthly"] }) {
  return amount.bandcoin ? (
    <b>
      <Money amount={amount.bandcoin} currency="BANDCOIN" />
    </b>
  ) : (
    <b>a small fee</b>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="bg-surface grid content-start gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-t pt-5">
      <h2 className="display text-lg">{title}</h2>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

const KIND: Record<Overview["payments"][number]["kind"], string> = {
  FREE_TRIAL: "Free first month",
  RENEWAL: "Renewal",
  NAME_CHANGE: "Name change",
};

function History({ payments }: { payments: Overview["payments"] }) {
  if (payments.length === 0) return null;
  return (
    <section className="grid gap-3">
      <h2 className="display text-lg">Payments</h2>
      <ul className="bg-surface divide-y overflow-hidden rounded-[1.4rem] border-2">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{KIND[payment.kind]}</span>
              <span className="text-fg-muted text-xs">
                {day(payment.createdAt)} · paid until {day(payment.periodEnd)}
              </span>
            </span>
            {payment.kind === "FREE_TRIAL" ? (
              <span className="text-fg-muted">Free</span>
            ) : (
              <Money amount={payment.amount} currency={payment.currency} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
