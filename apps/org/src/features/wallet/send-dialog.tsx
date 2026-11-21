"use client";

import { Gift, UserRound } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Input } from "@actiontokens/ui/components/input";
import { PriceBreakdown, ShortfallNotice } from "@actiontokens/ui/patterns/price-breakdown";

import { Money } from "~/components/money";
import { CURRENCY } from "~/lib/wallet";
import { api, type RouterOutputs } from "~/trpc/react";

import { Problem } from "../recharge/quote-breakdown";
import type { WalletOrderFlow } from "./use-wallet-order";

type Token = RouterOutputs["wallet"]["assets"]["tokens"][number];
const keyOf = (token: { code: string; issuer: string | null }) =>
  `${token.code}:${token.issuer ?? "native"}`;
const AMOUNT = /^\d{0,12}(\.\d{0,7})?$/;
const short = (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`;

/** An amount of the token being sent: XLM, BANDCOIN and USDC with their icon, others with their code. */
function Amount({ amount, token }: { amount: string; token: Token }) {
  return <Money amount={amount} currency={CURRENCY[token.kind]} code={token.code} />;
}

/**
 * Send XLM or any token in the wallet to a Stellar address or a Bandcoin
 * @username. The server's quote names the recipient and shows everything that
 * leaves the wallet before anything is signed; a token they can't hold yet
 * goes as a gift they accept.
 */
export function SendDialog({
  tokens,
  initial,
  flow,
  onClose,
}: {
  tokens: Token[];
  initial?: Token;
  flow: WalletOrderFlow;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(keyOf(initial ?? tokens[0]!));
  const token = tokens.find((entry) => keyOf(entry) === selected) ?? tokens[0]!;
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const ready = to.trim().length > 1 && Number(amount) > 0;
  const input = useDeferredValue({
    to: to.trim(),
    code: token.code,
    issuer: token.issuer,
    amount,
  });
  const quote = api.wallet.send.quote.useQuery(input, {
    // the deferred copy is what's sent, so it decides
    enabled: input.to.length > 1 && Number(input.amount) > 0,
    placeholderData: (previous) => previous,
  });
  const q = ready ? quote.data : undefined;
  const shortfall = q?.problems.find((problem) => problem.code === "INSUFFICIENT_FUNDS");
  const notices = q?.problems.filter((problem) => problem.code !== "INSUFFICIENT_FUNDS") ?? [];
  const who = q?.recipient
    ? q.recipient.username
      ? `@${q.recipient.username}`
      : short(q.recipient.address)
    : null;

  async function send() {
    if (!q?.ok || !who) return;
    onClose();
    await flow.run({
      kind: "send",
      input: { to: to.trim(), code: token.code, issuer: token.issuer, amount },
      summary: (
        <>
          <Amount amount={q.amount} token={token} /> to {who}
        </>
      ),
      success: {
        title: q.mode === "gift" ? `Sent to ${who} as a gift` : `Sent to ${who}`,
        body:
          q.mode === "gift"
            ? "They'll find it under Pending gifts and accept it from there."
            : "It can take a few seconds to show in their wallet.",
      },
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="display text-3xl">Send</DialogTitle>
          <DialogDescription>
            Send XLM or any token in your wallet to a Stellar address or a Action Tokens @username.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            What
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="bg-surface h-11 rounded-md border px-3 text-sm"
            >
              {tokens.map((entry) => (
                <option key={keyOf(entry)} value={keyOf(entry)}>
                  {entry.code} · {entry.title} ({Number(entry.amount).toLocaleString("en-US")})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            To
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="@username or G… address"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="flex items-center justify-between text-sm font-medium">
              Amount
              <span className="text-fg-muted text-xs font-normal">
                You have <Amount amount={token.amount} token={token} />
              </span>
            </span>
            <span className="flex gap-2">
              <Input
                inputMode="decimal"
                value={amount}
                placeholder="0"
                aria-label={`Amount of ${token.code}`}
                onChange={(event) => {
                  const next = event.target.value.replace(/,/g, "");
                  if (AMOUNT.test(next)) setAmount(next);
                }}
                className="display h-12 text-3xl"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12"
                disabled={Number(token.amount) <= 0}
                onClick={() => setAmount(String(Number(token.amount)))}
              >
                Max
              </Button>
            </span>
          </label>

          {q?.recipient && (
            <div className="bg-surface-2 flex items-start gap-3 rounded-xl p-3 text-sm">
              {q.mode === "gift" ? (
                <Gift className="text-primary-text mt-0.5 size-4 shrink-0" />
              ) : (
                <UserRound className="text-primary-text mt-0.5 size-4 shrink-0" />
              )}
              <span className="grid min-w-0 gap-0.5">
                <span className="font-semibold">
                  {q.recipient.username ? `@${q.recipient.username}` : "Stellar address"}
                  {q.recipient.name && (
                    <span className="text-fg-muted font-normal"> · {q.recipient.name}</span>
                  )}
                </span>
                <span className="text-fg-muted truncate font-mono text-xs">
                  {q.recipient.address}
                </span>
                {q.mode === "gift" && (
                  <span className="text-fg-muted text-xs">
                    They can&apos;t hold {token.code} yet, so it goes as a gift they accept. 1 XLM
                    of yours is held with it until then, and you can take it back.
                  </span>
                )}
                {q.mode === "create" && (
                  <span className="text-fg-muted text-xs">
                    This address isn&apos;t on Stellar yet: your XLM opens it.
                  </span>
                )}
              </span>
            </div>
          )}

          {q && q.lines.length > 0 && q.ok && (
            <PriceBreakdown
              lines={q.lines
                .filter((line) => line.key !== "total")
                .map((line) => ({
                  label: line.label,
                  value:
                    line.key === "send" ? (
                      <Amount amount={line.amount} token={token} />
                    ) : (
                      <Money amount={line.amount} currency="XLM" />
                    ),
                }))}
              total={<Money amount={q.total} currency="XLM" />}
            />
          )}
          {shortfall && "shortfall" in shortfall && (
            <ShortfallNotice
              currency={shortfall.shortfall.currency}
              shortBy={<Money amount={shortfall.shortfall.short} currency="XLM" />}
            />
          )}
          {notices.map((problem) => (
            <Problem key={problem.message} message={problem.message} />
          ))}

          <Button
            size="lg"
            disabled={!q?.ok || flow.busy || quote.isFetching}
            onClick={() => void send()}
          >
            {who ? `Send to ${who}` : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
