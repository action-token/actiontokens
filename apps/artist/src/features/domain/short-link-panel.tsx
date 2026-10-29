"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { VANITY_HOST } from "./host";
import { NameField } from "./name-field";
import { PayPanel } from "./pay-panel";

type Overview = RouterOutputs["vanity"]["overview"];
type Link = NonNullable<Overview["link"]>;

const day = (date: Date | string) =>
  new Date(date).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

/** One plain line about where the link stands; only a link that needs action gets a warning colour. */
const STATUS: Record<Link["status"], { warn: boolean; say: (link: Link) => string }> = {
  TRIAL: { warn: false, say: (l) => `Free until ${day(l.paidUntil)}` },
  ACTIVE: { warn: false, say: (l) => `Paid until ${day(l.paidUntil)}` },
  GRACE: { warn: true, say: (l) => `Ran out. Renew by ${day(l.graceEndsAt)} to keep it working.` },
  LAPSED: { warn: true, say: (l) => `Turned off. Renew by ${day(l.heldUntil)} to keep this name.` },
};

/**
 * The artist's short link, bandcoin.io/their-name: free for the first month,
 * then renewed monthly (the grace and name-keeping rules live in
 * services/artist/vanity). Every payment shows its full price first.
 * Shown as a tab of Settings.
 */
export function ShortLinkPanel() {
  const overview = api.vanity.overview.useQuery();

  if (overview.isPending) return <Skeleton className="h-64 w-full rounded-[1.4rem]" />;
  if (overview.isError)
    return (
      <ErrorState message="Couldn't load your link." onRetry={() => void overview.refetch()} />
    );
  return (
    <div className="grid gap-6">
      <LinkCard overview={overview.data} />
      <History payments={overview.data.payments} />
    </div>
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
              Free for the first month, then <Price amount={prices.monthly} /> a month.
            </p>
          </div>
        ) : name ? (
          <PayPanel purpose="RENEWAL" name={name} onDone={done} />
        ) : (
          <p className="text-fg-muted text-sm">
            Pick a name. It is <Price amount={prices.monthly} /> a month.
          </p>
        )}
      </Card>
    );
  }

  const status = STATUS[link.status];
  const url = `https://${VANITY_HOST}/${link.name}`;
  return (
    <Card>
      <div className="grid gap-1">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="display truncate text-xl hover:underline"
        >
          {VANITY_HOST}/<b>{link.name}</b>
        </a>
        <p className={status.warn ? "text-danger text-sm font-medium" : "text-fg-muted text-sm"}>
          {status.say(link)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={url} />
        <Button
          variant={status.warn ? "default" : "outline"}
          onClick={() => setPanel(panel === "renew" ? null : "renew")}
        >
          Renew
        </Button>
      </div>

      {panel === "renew" && (
        <Section>
          <p className="text-fg-muted text-sm">
            One more month for <Price amount={prices.monthly} />, added to the time you have left.
          </p>
          <PayPanel purpose="RENEWAL" onDone={done} />
        </Section>
      )}

      {link.works && (
        <details
          open={panel === "rename"}
          onToggle={(event) => setPanel(event.currentTarget.open ? "rename" : null)}
          className="border-t pt-4"
        >
          <summary className="text-fg-muted cursor-pointer text-sm">Change the name</summary>
          {panel === "rename" && (
            <div className="mt-4 grid gap-4">
              <p className="text-fg-muted text-sm">
                One-time <Price amount={prices.nameChange} />. You keep your paid time; the old link
                stops working.
              </p>
              <NameField value={value} onValue={setValue} onUsable={onUsable} current={link.name} />
              {name && <PayPanel purpose="NAME_CHANGE" name={name} onDone={done} />}
            </div>
          )}
        </details>
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

function Section({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 border-t pt-5">{children}</div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
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
    <details className="grid gap-3">
      <summary className="text-fg-muted cursor-pointer text-sm">Payment history</summary>
      <ul className="bg-surface mt-3 divide-y overflow-hidden rounded-[1.4rem] border-2">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{KIND[payment.kind]}</span>
              <span className="text-fg-muted text-xs">{day(payment.createdAt)}</span>
            </span>
            {payment.kind === "FREE_TRIAL" ? (
              <span className="text-fg-muted">Free</span>
            ) : (
              <Money amount={payment.amount} currency={payment.currency} />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
