"use client";

import {
  Award,
  BarChart3,
  CalendarRange,
  Check,
  Clock,
  Gem,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api, type RouterOutputs } from "~/trpc/react";

type Reward = RouterOutputs["reward"]["mine"][number];
type Tab = "checker" | "holders" | "origin" | "quarter";

const TABS: { key: Tab; label: string; icon: typeof Wallet }[] = [
  { key: "checker", label: "Checker", icon: Wallet },
  { key: "holders", label: "Asset holders", icon: BarChart3 },
  { key: "origin", label: "Origin rewards", icon: Gem },
  { key: "quarter", label: "Quarter rewards", icon: CalendarRange },
];

const KIND: Record<Reward["kind"], { label: string; text: string }> = {
  origin: { label: "Origin", text: "Monthly, for PLOT holders" },
  quarter: { label: "Quarter", text: "Every quarter, for ACTION held all quarter" },
};

const num = (value: string | number, digits = 4) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
const short = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-6)}`;

/**
 * The reward checker, as in the original: Checker (your rounds, then any wallet's tokens and
 * standing), Asset holders (who holds a token, ranked), and the Origin and Quarter rounds as
 * ranked tables you can search by wallet. Tab and wallet live in the address, so links share.
 */
export function RewardsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "checker";
  const wallet = params.get("wallet") ?? "";
  const go = (next: { tab?: Tab; wallet?: string }) => {
    const query = new URLSearchParams(params.toString());
    if (next.tab) query.set("tab", next.tab);
    if (next.wallet !== undefined) {
      if (next.wallet) query.set("wallet", next.wallet);
      else query.delete("wallet");
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };
  /** A wallet clicked in a table: open it in the checker. */
  const inspect = (address: string) => go({ tab: "checker", wallet: address });

  return (
    <div className="grid gap-6">
      <div className="cm-tabs rw-tabs" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => go({ tab: key })}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "checker" && (
        <Checker key={wallet} wallet={wallet} onWallet={(w) => go({ wallet: w })} />
      )}
      {tab === "holders" && <Holders onWallet={inspect} />}
      {tab === "origin" && <Leaderboard kind="origin" onWallet={inspect} />}
      {tab === "quarter" && <Leaderboard kind="quarter" onWallet={inspect} />}
    </div>
  );
}

/* ── Checker ─────────────────────────────────────────────────────────────── */

function Checker({ wallet, onWallet }: { wallet: string; onWallet: (wallet: string) => void }) {
  const { data: session, status } = useSession();
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [typed, setTyped] = useState(wallet);
  const mine = api.reward.mine.useQuery(undefined, { enabled: status === "authenticated" });
  const check = api.reward.check.useQuery({ wallet }, { enabled: wallet.length > 0, retry: false });
  const own = session?.user.walletAddress;

  return (
    <div className="grid gap-8">
      <section className="rw-programs">
        <Program icon={<Gem className="size-5" />} title="Origin rewards" when="Every month">
          Hold PLOT NFTs when the month&apos;s snapshot is taken. The month&apos;s pot is shared by
          PLOT held × NFTs held, paid in ACTION.
        </Program>
        <Program
          icon={<CalendarRange className="size-5" />}
          title="Quarter rewards"
          when="Every quarter"
        >
          Keep ACTION all quarter: 1 ACTION back for every 1,000 you held at your lowest point.
        </Program>
      </section>

      <section className="grid gap-4">
        <h2 className="rw-h">Your rewards</h2>
        {status !== "authenticated" ? (
          <div className="rw-card rw-card--center">
            <Wallet className="size-6" />
            <p>Sign in to see what the rounds owe your wallet.</p>
            <Button onClick={() => openWallet(true)}>Sign in</Button>
          </div>
        ) : mine.isPending ? (
          <Skeleton className="h-32 rounded-3xl" />
        ) : (
          <Rounds
            rows={mine.data ?? []}
            empty="None of the recent rounds include your wallet yet."
          />
        )}
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="rw-h">Check a wallet</h2>
          {own && (
            <button type="button" className="hm-more" onClick={() => onWallet(own)}>
              Use my wallet →
            </button>
          )}
        </div>
        <form
          className="rw-search"
          onSubmit={(event) => {
            event.preventDefault();
            onWallet(typed.trim().toUpperCase());
          }}
        >
          <Search className="size-4 shrink-0" />
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Stellar wallet address (G…)"
            aria-label="Wallet address"
            spellCheck={false}
            autoComplete="off"
          />
          <Button type="submit" size="sm" disabled={!typed.trim() || check.isFetching}>
            {check.isFetching ? "Checking…" : "Check"}
          </Button>
        </form>
        {wallet && check.error && <p className="cm-note">{check.error.message}</p>}
        {wallet && check.isFetching && !check.data && <Skeleton className="h-48 rounded-3xl" />}
        {check.data && <Checked data={check.data} />}
      </section>
    </div>
  );
}

function Program({
  icon,
  title,
  when,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  when: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rw-program">
      <span className="rw-program-icon">{icon}</span>
      <p className="cm-eyebrow">{when}</p>
      <p className="rw-program-title">{title}</p>
      <p className="text-fg-muted text-sm">{children}</p>
    </div>
  );
}

function Status({ paid, blocked }: { paid: boolean; blocked?: boolean }) {
  return (
    <span
      className={cn(
        "rw-status",
        blocked ? "rw-status--no" : paid ? "rw-status--ok" : "rw-status--wait",
      )}
    >
      {blocked ? (
        <>
          <ShieldAlert className="size-3.5" /> Blocked
        </>
      ) : paid ? (
        <>
          <Check className="size-3.5" /> Paid
        </>
      ) : (
        <>
          <Clock className="size-3.5" /> Pending
        </>
      )}
    </span>
  );
}

function Rounds({ rows, empty }: { rows: Reward[]; empty: string }) {
  if (rows.length === 0) return <p className="cm-note">{empty}</p>;
  const total = (list: Reward[]) => list.reduce((sum, row) => sum + Number(row.amount), 0);
  return (
    <div className="grid gap-3">
      <div className="rw-totals">
        <span>
          <small>Paid</small>
          <b>{num(total(rows.filter((row) => row.paid)))} ACTION</b>
        </span>
        <span>
          <small>Pending</small>
          <b>{num(total(rows.filter((row) => !row.paid && !row.blocked)))} ACTION</b>
        </span>
        <span>
          <small>Rounds</small>
          <b>{rows.length}</b>
        </span>
      </div>
      {rows.some((row) => row.blocked) && (
        <p className="rw-blocked">
          <ShieldAlert className="size-4" /> This wallet is on a program&apos;s block list, so those
          rounds don&apos;t pay it. Ask support if that looks wrong.
        </p>
      )}
      <ul className="rw-rounds">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.label}`}>
            <span className="rw-round-icon">
              <Award className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">
                {KIND[row.kind].label} · {row.label}
              </b>
              <span className="text-fg-faint text-xs">{KIND[row.kind].text}</span>
            </span>
            <span className="rw-amount">{num(row.amount)} ACTION</span>
            <Status paid={row.paid} blocked={row.blocked} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Checked({ data }: { data: RouterOutputs["reward"]["check"] }) {
  if (!data.found)
    return (
      <p className="cm-note">
        This wallet isn&apos;t on the network yet (it has never been funded).
      </p>
    );
  const programs = data.programs;
  const action = programs ? Number(programs.actionHeld) : 0;
  return (
    <div className="grid gap-4">
      <p className="text-fg-faint font-mono text-xs break-all">{data.wallet}</p>
      {programs ? (
        <div className="rw-standing">
          <Standing
            ok={programs.plots > 0}
            title={`Origin · ${data.current.month}`}
            text={
              programs.plots > 0
                ? `Holds ${programs.plots} PLOT NFT${programs.plots === 1 ? "" : "s"}: in this month's round.`
                : "No PLOT NFTs: not in the monthly round."
            }
          />
          <Standing
            ok={action > 0}
            title={`Quarter · ${data.current.quarter.year} ${data.current.quarter.quarter}`}
            text={
              action > 0
                ? `Holds ${num(action, 2)} ${programs.actionCode}. Keep it all quarter.`
                : `No ${programs.actionCode}: nothing for this quarter yet.`
            }
          />
        </div>
      ) : (
        <p className="cm-note">
          The holder programs aren&apos;t running on this network yet, so there&apos;s no standing
          to show.
        </p>
      )}
      <Rounds rows={data.rewards} empty="None of the recent rounds include this wallet." />
      <div className="grid gap-2">
        <h3 className="cm-eyebrow">Tokens · {data.balances.length}</h3>
        <ul className="rw-tokens">
          {data.balances.map((line) => (
            <li key={`${line.code}-${line.issuer ?? "native"}`}>
              <span className="cm-req-icon">{line.code.slice(0, 2)}</span>
              <span className="min-w-0 flex-1">
                <b className="block">{line.code}</b>
                <span className="text-fg-faint block truncate font-mono text-[10px]">
                  {line.issuer ? short(line.issuer) : "Stellar lumens"}
                </span>
              </span>
              <span className="rw-amount">{num(line.balance)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Standing({ ok, title, text }: { ok: boolean; title: string; text: string }) {
  return (
    <div className={cn("rw-stand", ok ? "rw-stand--ok" : "rw-stand--no")}>
      <span className="rw-stand-dot">
        {ok ? <Check className="size-4" /> : <Clock className="size-4" />}
      </span>
      <span>
        <b className="block">{title}</b>
        <span className="text-fg-muted text-sm">{text}</span>
      </span>
    </div>
  );
}

/* ── Asset holders ───────────────────────────────────────────────────────── */

function Holders({ onWallet }: { onWallet: (wallet: string) => void }) {
  const { status } = useSession();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [issuer, setIssuer] = useState("");
  const [asset, setAsset] = useState<{ assetCode: string; assetIssuer: string } | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(typed.trim()), 350);
    return () => window.clearTimeout(id);
  }, [typed]);
  const hits = api.community.searchAssets.useQuery(
    { search },
    { enabled: status === "authenticated" && search.length > 1 && !asset },
  );
  const holders = api.reward.holders.useQuery(asset ?? { assetCode: "", assetIssuer: "" }, {
    enabled: asset !== null,
    retry: false,
  });
  const manualOk =
    /^[A-Za-z0-9]{1,12}$/.test(typed.trim()) && /^G[A-Z2-7]{55}$/.test(issuer.trim());

  return (
    <section className="grid gap-4">
      <div className="relative grid gap-2">
        <form
          className="rw-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (manualOk) setAsset({ assetCode: typed.trim(), assetIssuer: issuer.trim() });
          }}
        >
          <Search className="size-4 shrink-0" />
          <input
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setAsset(null);
            }}
            placeholder="Token code, e.g. ACTION"
            aria-label="Token code"
            className="max-w-40"
          />
          <input
            value={issuer}
            onChange={(event) => {
              setIssuer(event.target.value.toUpperCase());
              setAsset(null);
            }}
            placeholder="Issuer (G…), or pick from the list"
            aria-label="Issuer"
            spellCheck={false}
          />
          <Button type="submit" size="sm" disabled={!manualOk || holders.isFetching}>
            {holders.isFetching ? "Finding…" : "Find holders"}
          </Button>
        </form>
        {!asset &&
          search.length > 1 &&
          status === "authenticated" &&
          (hits.data ?? []).length > 0 && (
            <ul className="cm-hits">
              {hits.data!.map((hit) => (
                <li key={`${hit.assetCode}-${hit.assetIssuer}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setTyped(hit.assetCode);
                      setIssuer(hit.assetIssuer);
                      setAsset({ assetCode: hit.assetCode, assetIssuer: hit.assetIssuer });
                    }}
                  >
                    <span className="cm-req-icon">{hit.assetCode.slice(0, 2)}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block">${hit.assetCode}</b>
                      <span className="text-fg-faint block truncate text-xs">
                        {hit.org ?? short(hit.assetIssuer)} · {num(hit.trustlines, 0)} trustlines
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        {status !== "authenticated" && (
          <p className="text-fg-faint text-xs">
            Sign in to search tokens by name; or type the code and issuer.
          </p>
        )}
      </div>
      {holders.error && <p className="cm-note">{holders.error.message}</p>}
      {asset && holders.isFetching && <Skeleton className="h-64 rounded-3xl" />}
      {holders.data &&
        (holders.data.rows.length === 0 ? (
          <p className="cm-note">Nobody holds this token yet.</p>
        ) : (
          <>
            <p className="text-fg-muted text-sm">
              {num(holders.data.total, 0)} holders
              {holders.data.total > holders.data.rows.length &&
                ` · top ${holders.data.rows.length}`}
              {!holders.data.complete && " · too many to list them all"}
            </p>
            <Table head={["#", "Wallet", "Holds"]}>
              {holders.data.rows.map((row) => (
                <tr key={row.wallet}>
                  <td className="rw-rank">{row.rank}</td>
                  <td>
                    <WalletCell wallet={row.wallet} onWallet={onWallet} />
                  </td>
                  <td className="rw-num">{num(row.balance)}</td>
                </tr>
              ))}
            </Table>
          </>
        ))}
    </section>
  );
}

/* ── Origin / Quarter rounds ─────────────────────────────────────────────── */

function Leaderboard({
  kind,
  onWallet,
}: {
  kind: "origin" | "quarter";
  onWallet: (wallet: string) => void;
}) {
  const { data: session } = useSession();
  const own = session?.user.walletAddress;
  const rounds = api.reward.rounds.useQuery({ kind });
  const [picked, setPicked] = useState<string | null>(null);
  const roundId = picked ?? rounds.data?.[0]?.id ?? null;
  const round = rounds.data?.find((r) => r.id === roundId);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(typed.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [typed]);
  const board = api.reward.leaderboard.useQuery(
    { kind, id: roundId ?? "", search: search || undefined, page },
    { enabled: roundId !== null, placeholderData: (previous) => previous },
  );

  if (rounds.isPending) return <Skeleton className="h-64 rounded-3xl" />;
  if (!rounds.data?.length)
    return (
      <p className="cm-note">
        No {kind === "origin" ? "monthly" : "quarterly"} rounds have been taken yet.
      </p>
    );

  return (
    <section className="grid gap-4">
      <div className="rw-board-bar">
        <label className="rw-select">
          <span className="cm-eyebrow">{kind === "origin" ? "Month" : "Quarter"}</span>
          <select
            value={roundId ?? ""}
            onChange={(event) => {
              setPicked(event.target.value);
              setPage(0);
            }}
          >
            {rounds.data.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cm-search">
          <Search className="size-4 shrink-0" />
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Search by wallet address"
            aria-label="Search by wallet"
            spellCheck={false}
          />
        </label>
        {own && (
          <button type="button" className="hm-more" onClick={() => setTyped(own)}>
            Find me →
          </button>
        )}
      </div>
      {round && (
        <div className="rw-totals">
          <span>
            <small>Holders</small>
            <b>{num(round.holders, 0)}</b>
          </span>
          <span>
            <small>{kind === "origin" ? "Pot" : "Rule"}</small>
            <b>{kind === "origin" ? `${num(round.pot ?? 0)} ACTION` : "1 per 1,000 held"}</b>
          </span>
          <span>
            <small>Status</small>
            <b>
              {round.rewardedAt
                ? `Paid ${new Date(round.rewardedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : "Not paid yet"}
            </b>
          </span>
        </div>
      )}
      {board.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : !board.data || board.data.rows.length === 0 ? (
        <p className="cm-note">
          {search ? "No wallet in this round matches that." : "This round has no holders."}
        </p>
      ) : (
        <>
          <Table
            head={
              kind === "origin"
                ? ["#", "Wallet", "PLOT held", "NFTs", "Reward", ""]
                : ["#", "Wallet", "Lowest ACTION", "Reward", ""]
            }
          >
            {board.data.rows.map((row) => (
              <tr key={row.wallet} data-me={row.wallet === own || undefined}>
                <td className="rw-rank">{row.rank}</td>
                <td>
                  <WalletCell wallet={row.wallet} onWallet={onWallet} />
                </td>
                <td className="rw-num">{num(row.held, 2)}</td>
                {kind === "origin" && <td className="rw-num">{row.plots}</td>}
                <td className="rw-num">
                  {row.amount === null ? "—" : `${num(row.amount)} ACTION`}
                </td>
                <td className="text-right">
                  {row.amount === null ? (
                    <Status paid={false} blocked />
                  ) : (
                    <Status paid={row.paid} />
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-fg-muted">
              {search
                ? `${num(board.data.matched, 0)} of ${num(board.data.total, 0)}`
                : `${num(board.data.total, 0)} holders`}
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!board.data.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="rw-table-wrap">
      <table className="rw-table">
        <thead>
          <tr>
            {head.map((label, index) => (
              <th key={index}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function WalletCell({ wallet, onWallet }: { wallet: string; onWallet: (wallet: string) => void }) {
  return (
    <button type="button" className="rw-wallet" onClick={() => onWallet(wallet)} title={wallet}>
      {short(wallet)}
    </button>
  );
}
