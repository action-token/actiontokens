"use client";

import { ArrowLeft, ArrowRight, CircleAlert, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Label } from "@actiontokens/ui/components/label";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { PriceBreakdown, ShortfallNotice } from "@actiontokens/ui/patterns/price-breakdown";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";
import { FAN_APP_URL } from "../shell/links";

import { type PayoutInput } from "./use-royalty-payout";

type Item = RouterOutputs["royalty"]["items"][number];
type Currency = PayoutInput["currency"];
type Flow = { run: (input: PayoutInput, summary: React.ReactNode) => Promise<void>; busy: boolean };
type Details = { revenue: string; currency: Currency; report: PickedFile; reportSize: number };

const CURRENCIES: Currency[] = ["BANDCOIN", "XLM", "USDC"];
const REPORT_TYPES =
  "application/pdf,text/csv,text/plain,.pdf,.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const short = (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`;

/**
 * Two steps: say what the item earned (with the report), then check who gets
 * what and pay. The price is worked out by the server and shown in full before
 * anything is signed.
 */
export function PayoutForm({ item, flow }: { item: Item; flow: Flow }) {
  const [details, setDetails] = useState<Details | null>(null);
  return details ? (
    <Review item={item} flow={flow} details={details} onBack={() => setDetails(null)} />
  ) : (
    <EarningsStep item={item} onNext={setDetails} />
  );
}

function EarningsStep({ item, onNext }: { item: Item; onNext: (details: Details) => void }) {
  const [revenue, setRevenue] = useState("");
  const [currency, setCurrency] = useState<Currency>("BANDCOIN");
  const [report, setReport] = useState<PickedFile | null>(null);
  const [reportSize, setReportSize] = useState(0);
  const ready = Number(revenue) > 0 && report !== null && reportSize > 0;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="royalty-revenue">How much did it earn?</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="royalty-revenue"
            inputMode="decimal"
            value={revenue}
            placeholder="1000"
            className="num max-w-44"
            onChange={(event) => setRevenue(event.target.value.replace(/[^\d.]/g, ""))}
          />
          <div role="radiogroup" aria-label="Currency" className="flex flex-wrap gap-2">
            {CURRENCIES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={currency === option}
                onClick={() => setCurrency(option)}
                className={cn(
                  "rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors",
                  currency === option ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <p className="text-fg-faint text-xs">
          Fans who hold {item.title} share {item.percent}% of it.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="royalty-report">Earnings report</Label>
        <FileField
          id="royalty-report"
          accept={REPORT_TYPES}
          value={report}
          onChange={setReport}
          onFile={(file) => setReportSize(file.size)}
          hint="A PDF or spreadsheet. Fans can open it from their payout."
        />
      </div>

      <Button
        disabled={!ready}
        className="justify-self-start"
        onClick={() => report && onNext({ revenue, currency, report, reportSize })}
      >
        Continue <ArrowRight />
      </Button>
    </div>
  );
}

function Review({
  item,
  flow,
  details,
  onBack,
}: {
  item: Item;
  flow: Flow;
  details: Details;
  onBack: () => void;
}) {
  const { revenue, currency, report, reportSize } = details;
  const input = { itemId: item.id, revenue, currency };
  const quote = api.royalty.quote.useQuery(input, { refetchInterval: 30_000 });
  const me = api.account.me.useQuery();

  const data = quote.data;
  const main = data?.totals.find((total) => total.currency === currency);
  const shortfalls = data?.problems.flatMap((problem) =>
    problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : [],
  );
  const notices = data?.problems.filter((problem) => problem.code === "UNAVAILABLE") ?? [];
  const myShort = shortfalls?.find((shortfall) => shortfall.currency === currency);
  const balance = me.data?.balances[currency];

  const pay = () =>
    void flow.run(
      {
        ...input,
        report: {
          url: report.url,
          name: report.name,
          size: reportSize,
          type: report.mime || "application/octet-stream",
        },
      },
      main ? <Money amount={main.amount} currency={currency} /> : null,
    );

  if (quote.isError)
    return (
      <div className="grid gap-4">
        <p role="alert" className="text-danger text-sm">
          {quote.error.message}
        </p>
        <Button variant="outline" className="justify-self-start" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      </div>
    );

  if (!data)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );

  return (
    <div className="grid gap-5">
      <p className="text-[15px]">
        <strong>{data.holders.count}</strong> {data.holders.count === 1 ? "fan gets" : "fans get"}{" "}
        <strong>
          <Money amount={data.paid} currency={currency} />
        </strong>{" "}
        in total.
        {Number(data.kept) > 0 && (
          <span className="text-fg-muted">
            {" "}
            You keep <Money amount={data.kept} currency={currency} /> for shares nobody holds.
          </span>
        )}
      </p>

      <PriceBreakdown
        lines={data.lines.map((line) => ({
          label: line.label,
          detail: line.detail,
          value: <Money amount={line.amount} currency={line.currency} />,
        }))}
        total={
          <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
            {data.totals.map((total) => (
              <Money key={total.currency} amount={total.amount} currency={total.currency} />
            ))}
          </span>
        }
        balance={
          balance
            ? {
                value: <Money amount={balance} currency={currency} />,
                shortBy: myShort ? <Money amount={myShort.short} currency={currency} /> : undefined,
              }
            : undefined
        }
      />

      {shortfalls?.map((shortfall) => (
        <div key={shortfall.currency}>
          <ShortfallNotice
            currency={shortfall.currency}
            shortBy={<Money amount={shortfall.short} currency={shortfall.currency} />}
          />
          <a href={`${FAN_APP_URL}/recharge`} className="text-primary-text text-xs underline">
            Add funds
          </a>
        </div>
      ))}
      {notices.map((problem) => (
        <div
          key={problem.message}
          role="alert"
          className="bg-surface-2 text-fg-muted flex gap-2.5 rounded-md p-3 text-[13px]"
        >
          <CircleAlert className="text-warning mt-px size-4 shrink-0" />
          {problem.message}
        </div>
      ))}
      {data.holders.skipped > 0 && (
        <p className="text-fg-muted text-xs">
          {data.holders.skipped} {data.holders.skipped === 1 ? "fan can't" : "fans can't"} receive{" "}
          {currency} yet and {data.holders.skipped === 1 ? "is" : "are"} left out. Pay in XLM to
          reach everyone.
        </p>
      )}
      {data.holders.preview.length > 0 && <Holders data={data} currency={currency} />}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={flow.busy} onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button disabled={!data.ok || flow.busy} onClick={pay}>
          <Send />{" "}
          {flow.busy ? (
            "Working…"
          ) : main ? (
            <>
              Pay <Money amount={main.amount} currency={currency} />
            </>
          ) : (
            "Pay"
          )}
        </Button>
      </div>
    </div>
  );
}

function Holders({
  data,
  currency,
}: {
  data: RouterOutputs["royalty"]["quote"];
  currency: Currency;
}) {
  const more = data.holders.count - data.holders.preview.length;
  return (
    <details className="rounded-xl border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">See who gets paid</summary>
      <ul className="max-h-64 divide-y overflow-y-auto border-t text-sm">
        {data.holders.preview.map((holder) => (
          <li key={holder.address} className="flex items-center gap-3 px-3 py-2">
            <span className="num text-fg-muted flex-1" title={holder.address}>
              {short(holder.address)}
            </span>
            <Money amount={holder.amount} currency={currency} />
          </li>
        ))}
        {more > 0 && <li className="text-fg-muted px-3 py-2 text-xs">and {more} more</li>}
      </ul>
    </details>
  );
}
